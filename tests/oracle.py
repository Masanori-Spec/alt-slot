#!/usr/bin/env python3
"""Independent, standard-library ZIP/ElementTree fixture and output oracle.

inspect FILE
verify BEFORE AFTER EXPECTED_JSON [--noop]

EXPECTED_JSON is a literal array of {part, path, after:{descr,title}} objects.
No application modules or generated receipts are trusted by this verifier.
"""
import argparse
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import posixpath
import re
import xml.etree.ElementTree as ET
from xml.parsers import expat
from zipfile import ZipFile

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
P = "http://schemas.openxmlformats.org/package/2006/relationships"


def digest(data):
    return sha256(data).hexdigest()


def unpack(data):
    with ZipFile(BytesIO(data)) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), "Duplicate ZIP member"
        return {name: archive.read(name) for name in names}


def relationships(members, source):
    directory, filename = posixpath.split(source)
    name = posixpath.join(directory, "_rels", filename + ".rels") if source else "_rels/.rels"
    if name not in members:
        return {}
    root = ET.fromstring(members[name])
    return {node.attrib["Id"]: dict(node.attrib) for node in root.findall("{" + P + "}Relationship")}


def resolve(source, target):
    return posixpath.normpath(posixpath.join(posixpath.dirname(source), target)) if not target.startswith("/") else target[1:]


def walk(root, path="", parent=None):
    yield path, root, parent
    for index, child in enumerate(root):
        yield from walk(child, (path + "/" if path else "") + str(index), root)


def roots(members):
    office = [x for x in relationships(members, "").values() if x["Type"] == R + "/officeDocument"]
    assert len(office) == 1
    main = resolve("", office[0]["Target"])
    stories = [(main, "main", 1)]
    document = ET.fromstring(members[main])
    mapping = relationships(members, main)
    references = {}
    for _, node, parent in walk(document):
        if parent is not None and parent.tag == "{" + W + "}sectPr" and node.tag in ("{" + W + "}headerReference", "{" + W + "}footerReference"):
            relation = mapping[node.attrib["{" + R + "}id"]]
            part = resolve(main, relation["Target"])
            kind = "header" if node.tag.endswith("headerReference") else "footer"
            old = references.get(part, (kind, 0))
            references[part] = (kind, old[1] + 1)
    stories.extend((part, kind, count) for part, (kind, count) in references.items())
    return stories


def inspect(data):
    members = unpack(data)
    records = []
    source_hash = digest(data)
    stories = roots(members)
    for part, kind, count in stories:
        root = ET.fromstring(members[part])
        rels = relationships(members, part)
        opening_spans = lexical_starts(members[part])
        for path, node, parent in walk(root):
            if node.tag != "{" + WP + "}docPr":
                continue
            media = None
            blips = list(parent.iter("{" + A + "}blip")) if parent is not None else []
            if len(blips) == 1:
                rid = blips[0].get("{" + R + "}embed")
                relation = rels.get(rid)
                if relation and relation.get("TargetMode", "Internal") == "Internal":
                    target = resolve(part, relation["Target"])
                    if target in members:
                        media = digest(members[target])
            attributes = sorted((key if key.startswith("{") else "{}" + key, value) for key, value in node.attrib.items())
            identity = {"sourceSha256": source_hash, "part": part, "path": path,
                        "originalAttributes": attributes, "mediaSha256": media}
            key = digest(json.dumps(identity, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
            records.append({**identity, "key": key, "name": node.get("name", ""),
                            "original": {"descr": node.get("descr"), "title": node.get("title")},
                            "kind": kind, "references": count,
                            "openingTag": members[part][slice(*opening_spans[path])].decode("utf-8"),
                            "placement": "floating" if parent is not None and parent.tag.endswith("}anchor") else "inline"})
    return {"sha256": source_hash, "occurrences": records,
            "members": {name: digest(value) for name, value in members.items()},
            "stories": [{"part": part, "kind": kind, "references": count} for part, kind, count in stories]}


def element_map(data):
    return {path: node for path, node, _ in walk(ET.fromstring(data))}


def structural(node):
    return [node.tag, sorted(node.attrib.items()), node.text, node.tail, [structural(child) for child in node]]


def lexical_starts(data):
    """Get byte spans independently with Expat, ignoring comments and PIs."""
    assert b"<!DOCTYPE" not in data and b"<!ENTITY" not in data, "DTD is outside the fixture contract"
    parser = expat.ParserCreate(namespace_separator="}")
    stack = []
    spans = {}
    def start(name, attributes):
        if stack:
            path = stack[-1][0] + ("/" if stack[-1][0] else "") + str(stack[-1][1])
            stack[-1][1] += 1
        else:
            path = ""
        begin = parser.CurrentByteIndex
        quote = None
        end = begin
        while end < len(data):
            char = data[end]
            if quote is not None:
                if char == quote:
                    quote = None
            elif char in (34, 39):
                quote = char
            elif char == 62:
                break
            end += 1
        spans[path] = (begin, end + 1)
        stack.append([path, 0])
    parser.StartElementHandler = start
    parser.EndElementHandler = lambda name: stack.pop()
    parser.Parse(data, True)
    return spans


def mask_attributes(data, paths):
    spans = lexical_starts(data)
    patches = []
    pattern = re.compile(rb"\s+([^\s=/<>]+)\s*=\s*(\"[^\"]*\"|'[^']*')")
    for path in paths:
        begin, end = spans[path]
        opening = data[begin:end]
        opening = pattern.sub(lambda match: b"" if match.group(1) in (b"descr", b"title") else match.group(), opening)
        # Deleting an attribute may retain its preceding XML separator. Ignore
        # only such separator whitespace in selected opening tags. All retained
        # attribute lexemes (including quotes/value entities), closing tags,
        # other start tags, text, comments, PIs, and every outside byte stay exact.
        remaining = list(pattern.finditer(opening))
        whitespace = b" \t\r\n"
        if remaining:
            opening = (opening[:remaining[0].start()].rstrip(whitespace)
                       + b"".join(b" " + match.group().lstrip(whitespace) for match in remaining)
                       + opening[remaining[-1].end():].lstrip(whitespace))
        else:
            opening = re.sub(rb"[ \t\r\n]+(?=/?>$)", b"", opening)
        patches.append((begin, end, opening))
    for begin, end, opening in sorted(patches, reverse=True):
        data = data[:begin] + opening + data[end:]
    return data


def verify(before, after, expected, no_op=False):
    original = unpack(before)
    result = unpack(after)
    assert set(original) == set(result), "ZIP member set changed"
    if no_op:
        assert before == after, "No-op changed whole-file bytes"
    by_part = {}
    for change in expected:
        assert set(change) == {"part", "path", "after"}
        assert set(change["after"]) == {"descr", "title"}
        targets = by_part.setdefault(change["part"], {})
        assert change["path"] not in targets, "Duplicate expected target"
        targets[change["path"]] = change["after"]
    changed_members = []
    for name in original:
        if original[name] != result[name]:
            changed_members.append(name)
        if name not in by_part:
            assert original[name] == result[name], "Untouched member changed: " + name
            continue
        old_root = ET.fromstring(original[name])
        new_root = ET.fromstring(result[name])
        old_nodes = {path: node for path, node, _ in walk(old_root)}
        new_nodes = {path: node for path, node, _ in walk(new_root)}
        assert old_nodes.keys() == new_nodes.keys(), "XML element paths changed"
        for path, attributes in by_part[name].items():
            assert old_nodes[path].tag == new_nodes[path].tag == "{" + WP + "}docPr"
            for attr, value in attributes.items():
                assert new_nodes[path].get(attr) == value, f"Expected literal differs at {name}#{path}.{attr}"
                old_nodes[path].attrib.pop(attr, None)
                new_nodes[path].attrib.pop(attr, None)
        assert structural(old_root) == structural(new_root), "XML changed beyond selected descr/title attributes: " + name
        assert mask_attributes(original[name], by_part[name]) == mask_attributes(result[name], by_part[name]), "XML lexical bytes changed beyond selected attributes and their separators: " + name
    return {"ok": True, "sourceSha256": digest(before), "outputSha256": digest(after),
            "memberCount": len(original), "changedParts": sorted(changed_members),
            "selectedOccurrences": len(expected), "noOpByteIdentical": before == after,
            "unaffectedMemberBytesIdentical": True, "xmlOnlySelectedAttributes": True,
            "xmlLexicalBytesOtherwiseIdentical": True, "selectedAttributeSeparatorWhitespaceIgnored": True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    read = sub.add_parser("inspect")
    read.add_argument("file")
    check = sub.add_parser("verify")
    check.add_argument("before")
    check.add_argument("after")
    check.add_argument("expected")
    check.add_argument("--noop", action="store_true")
    args = parser.parse_args()
    if args.command == "inspect":
        output = inspect(Path(args.file).read_bytes())
    else:
        output = verify(Path(args.before).read_bytes(), Path(args.after).read_bytes(), json.loads(Path(args.expected).read_text("utf-8")), args.noop)
    print(json.dumps(output, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()

"""Validate configured Supabase auth email templates without contacting hosted services."""

from html.parser import HTMLParser
from pathlib import Path
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "supabase" / "config.toml"
EXPECTED = {
    "confirmation": ("confirmation.html", {"ConfirmationURL", "Email"}),
    "recovery": ("recovery.html", {"ConfirmationURL", "Email"}),
    "magic_link": ("magic_link.html", {"ConfirmationURL", "Email"}),
    "email_change": ("email_change.html", {"ConfirmationURL", "Email", "NewEmail"}),
    "invite": ("invite.html", {"ConfirmationURL", "Email"}),
    "reauthentication": ("reauthentication.html", {"Token"}),
}
VARIABLE = re.compile(r"{{\s*\.([A-Za-z0-9_]+)\s*}}")


class Validator(HTMLParser):
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []
        self.remote_assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag not in self.VOID:
            self.stack.append(tag)
        for attr in ("src", "background"):
            value = attrs.get(attr, "")
            if value.startswith(("http://", "https://", "//")):
                self.remote_assets.append(value)

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        if not self.stack:
            self.errors.append(f"unexpected closing tag </{tag}>")
        elif self.stack[-1] != tag:
            self.errors.append(f"closing </{tag}> while <{self.stack[-1]}> is open")
        else:
            self.stack.pop()


def main():
    config = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    assert config["project_id"] == "arth", "Do not change the existing Supabase project ID"
    for flow, (filename, required_variables) in EXPECTED.items():
        section = config["auth"]["email"]["template"][flow]
        expected_path = f"./supabase/templates/{filename}"
        assert section["content_path"] == expected_path, f"{flow}: expected {expected_path}"
        path = ROOT / section["content_path"][2:].replace("/", "/")
        assert path.is_file(), f"{flow}: missing {path}"
        text = path.read_text(encoding="utf-8")
        parser = Validator()
        parser.feed(text)
        parser.close()
        assert not parser.errors, f"{flow}: malformed HTML: {parser.errors}"
        assert not parser.stack, f"{flow}: unclosed HTML tags: {parser.stack}"
        assert not parser.remote_assets, f"{flow}: remote assets are not allowed: {parser.remote_assets}"
        assert "SpendSense" in text and "Arth" not in text, f"{flow}: stale customer-facing brand"
        variables = set(VARIABLE.findall(text))
        assert variables == required_variables, f"{flow}: expected variables {required_variables}, got {variables}"
        if "ConfirmationURL" in required_variables:
            assert text.count('href="{{ .ConfirmationURL }}"') >= 2, f"{flow}: button and fallback must use ConfirmationURL"
        if flow == "email_change":
            assert "{{ .NewEmail }}" in text, "email change must identify the target address"
        if flow == "reauthentication":
            assert "{{ .Token }}" in text and "ConfirmationURL" not in text
        print(f"OK {flow}: {path.relative_to(ROOT)}; variables={','.join(sorted(variables))}")


if __name__ == "__main__":
    main()

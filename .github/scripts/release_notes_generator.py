#!/usr/bin/env python
"""Generate AI-powered release notes using Ollama Cloud API."""
from __future__ import annotations
import os, sys, json, re, pathlib, textwrap, requests
from openai import OpenAI

REPO = os.environ.get("GITHUB_REPOSITORY", "hamishfromatech/A-Coder")
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]

# Configure for Ollama Cloud API (OpenAI-compatible endpoint)
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "glm-5:cloud")

client = OpenAI(
    api_key=OLLAMA_API_KEY,
    base_url="https://ollama.com/v1",
)
headers = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}


def fetch_compare(base: str, head: str) -> dict:
    """Fetch the diff between two refs (tags/SHAs) in a single API call.

    Returns the commits between base and head plus the aggregate list of files
    changed across the whole range — only the changes in this release, not the
    full repository history.
    """
    url = f"https://api.github.com/repos/{REPO}/compare/{base}...{head}"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"Failed to fetch compare: {resp.status_code} {resp.text}", file=sys.stderr)
        return {}
    return resp.json()


def build_commit_details(compare: dict, limit: int = 50) -> tuple[list[dict], list[str]]:
    """Extract the most recent commits and the full changed-files list from a compare response.

    The compare API returns commits oldest→newest, so we keep the tail (the latest).
    Per-commit file lists aren't available from compare; the aggregate files list is
    returned instead.
    """
    commits = compare.get("commits", [])
    latest = commits[-limit:] if len(commits) > limit else commits
    details = [
        {
            "sha": c["sha"][:8],
            "message": c["commit"]["message"].split("\n")[0],
            "author": c["commit"]["author"]["name"],
            "date": c["commit"]["committer"]["date"][:10],
        }
        for c in latest
    ]
    files = [f["filename"] for f in compare.get("files", [])]
    return details, files


def fetch_latest_commits(limit: int = 50) -> tuple[list[dict], list[str]]:
    """Fallback when there is no previous tag to compare against."""
    url = f"https://api.github.com/repos/{REPO}/commits?sha=dev&per_page={limit}"
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        print(f"Failed to fetch commits: {resp.status_code} {resp.text}", file=sys.stderr)
        return [], []
    details = [
        {
            "sha": c["sha"][:8],
            "message": c["commit"]["message"].split("\n")[0],
            "author": c["commit"]["author"]["name"],
            "date": c["commit"]["committer"]["date"][:10],
        }
        for c in resp.json()
    ]
    return details, []


def generate_release_notes(commits: list[dict], previous_tag: str | None, new_tag: str, changed_files: list[str]) -> str:
    """Generate release notes using Ollama."""
    # Build a summary of commits (most recent first up to 50)
    commit_summary = "\n".join(
        f"- {c['sha']}: {c['message']} ({c['author']}, {c['date']})"
        for c in commits[:50]
    )

    files_section = ""
    if changed_files:
        shown = changed_files[:60]
        files_section = "\n\nFiles changed across this release:\n" + "\n".join(
            f"- {f}" for f in shown
        )
        if len(changed_files) > 60:
            files_section += f"\n- ... and {len(changed_files) - 60} more"

    since_label = previous_tag or "the previous release"
    prompt = textwrap.dedent(f"""\
You are generating release notes for a VS Code extension called A-Coder, an AI-powered coding assistant.

Release: {new_tag} (since {since_label})

Here are the most recent commits in this release:
{commit_summary}{files_section}

Generate professional, user-facing release notes following this format:

# A-Coder {new_tag}

## 🚀 New Features
- [List of new features based on commits]

## 🐛 Bug Fixes
- [List of bug fixes]

## 🔧 Improvements
- [List of improvements and refactoring]

## 📝 Other Changes
- [Any other changes like documentation, configuration, etc.]

---
**Full Commit Summary**
{commit_summary}

Keep the notes concise and focused on what users care about. Group related changes together.
Use clear, professional language. Only include categories that have actual changes.
""")

    resp = client.chat.completions.create(
        model=OLLAMA_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    return resp.choices[0].message.content


def main():
    # Get release information from environment (provided by release event)
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    event_data = json.loads(pathlib.Path(event_path).read_text()) if event_path else {}
    release_tag = os.environ.get("RELEASE_TAG") or event_data.get("release", {}).get("tag_name")

    if not release_tag:
        print("No release tag found. This workflow must be triggered by a release event.", file=sys.stderr)
        sys.exit(1)

    # Find the previous tag
    all_tags = requests.get(
        f"https://api.github.com/repos/{REPO}/tags?per_page=100",
        headers=headers
    ).json()

    if not isinstance(all_tags, list):
        print(f"Failed to fetch tags: {all_tags}", file=sys.stderr)
        sys.exit(1)

    tag_names = [t["name"] for t in all_tags]
    current_idx = tag_names.index(release_tag) if release_tag in tag_names else -1

    if current_idx <= 0:
        print(f"First release or previous tag not found ({release_tag}); using latest commits on dev.", file=sys.stderr)
        previous_tag = None
    else:
        previous_tag = all_tags[current_idx - 1]["name"]

    print(f"Generating notes for {release_tag} (since {previous_tag or 'start'})", file=sys.stderr)

    # Fetch only the changes in this release — one Compare API call instead of
    # paginating every commit since the last release and fetching each one's details.
    if previous_tag:
        compare = fetch_compare(previous_tag, release_tag)
        commit_details, changed_files = build_commit_details(compare, limit=50)
        if not commit_details:
            print("Compare returned no commits.", file=sys.stderr)
    else:
        commit_details, changed_files = fetch_latest_commits(limit=50)

    if not commit_details:
        notes = f"# A-Coder {release_tag}\n\nNo changes in this release."
    else:
        print(f"Found {len(commit_details)} commits and {len(changed_files)} changed files. Generating release notes...", file=sys.stderr)
        notes = generate_release_notes(commit_details, previous_tag, release_tag, changed_files)

    # Print the notes for output
    print(notes, end="")


if __name__ == "__main__":
    main()

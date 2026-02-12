#!/usr/bin/env python
"""Generate AI-powered release notes using Ollama Cloud API."""
from __future__ import annotations
import os, sys, json, re, pathlib, textwrap, requests
from openai import OpenAI

REPO = os.environ.get("GITHUB_REPOSITORY", "hamishfromatech/A-Coder")
GITHUB_TOKEN = os.environ["GITHUB_TOKEN"]

# Configure for Ollama Cloud API (OpenAI-compatible endpoint)
OLLAMA_API_KEY = os.environ.get("OLLAMA_API_KEY", "")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3-coder-next:cloud")

client = OpenAI(
    api_key=OLLAMA_API_KEY,
    base_url="https://ollama.com/v1",
)
headers = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json",
}


def fetch_commits_since_tag(tag: str) -> list[dict]:
    """Fetch all commits since the given tag."""
    commits, page = [], 1
    while True:
        url = (
            f"https://api.github.com/repos/{REPO}/commits"
            f"?sha=dev&since={tag}&per_page=100&page={page}"
        )
        resp = requests.get(url, headers=headers)
        if resp.status_code != 200:
            print(f"Failed to fetch commits: {resp.status_code} {resp.text}", file=sys.stderr)
            break
        chunk = resp.json()
        if not chunk:
            break
        commits.extend(chunk)
        page += 1
    return commits


def get_commit_details(commits: list[dict]) -> list[dict]:
    """Get detailed commit info including files changed."""
    details = []
    for commit in commits[:100]:  # Limit to 100 commits for context
        sha = commit["sha"]
        # Get the commit details with changed files
        url = f"https://api.github.com/repos/{REPO}/commits/{sha}"
        resp = requests.get(url, headers=headers)
        if resp.status_code == 200:
            detail = resp.json()
            details.append({
                "sha": sha[:8],
                "message": detail["commit"]["message"].split("\n")[0],
                "author": detail["commit"]["author"]["name"],
                "date": detail["commit"]["committer"]["date"][:10],
                "files": [f["filename"] for f in detail.get("files", [])],
            })
    return details


def generate_release_notes(commits: list[dict], previous_tag: str, new_tag: str) -> str:
    """Generate release notes using Ollama."""
    # Build a summary of commits
    commit_summary = "\n".join(
        f"- {c['sha']}: {c['message']} ({c['author']})\n  Files: {', '.join(c['files'][:5])}{'...' if len(c['files']) > 5 else ''}"
        for c in commits[:50]
    )

    prompt = textwrap.dedent(f"""\
You are generating release notes for a VS Code extension called A-Coder, an AI-powered coding assistant.

Release: {new_tag} (since {previous_tag})

Here are the commits since the previous release:
{commit_summary}

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


def update_release_notes(release_id: int, notes: str):
    """Update the GitHub release with new notes."""
    url = f"https://api.github.com/repos/{REPO}/releases/{release_id}"
    data = {"body": notes}
    resp = requests.patch(url, headers=headers, json=data)
    if resp.status_code == 200:
        print("✅ Release notes updated successfully!", file=sys.stderr)
    else:
        print(f"Failed to update release: {resp.status_code} {resp.text}", file=sys.stderr)


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
        print(f"First release or tag not found ({release_tag}), using last 50 commits.", file=sys.stderr)
        previous_tag = "1970-01-01T00:00:00Z"
    else:
        previous_tag = all_tags[current_idx - 1]["commit"]["sha"]

    print(f"Generating notes for {release_tag} (since {previous_tag})", file=sys.stderr)

    # Fetch commits
    commits = fetch_commits_since_tag(previous_tag)

    if not commits:
        print("No commits found since previous release.", file=sys.stderr)
        notes = f"# A-Coder {release_tag}\n\nNo changes in this release."
    else:
        print(f"Found {len(commits)} commits. Getting details...", file=sys.stderr)
        commit_details = get_commit_details(commits)
        print(f"Generating release notes...", file=sys.stderr)
        notes = generate_release_notes(commit_details, previous_tag, release_tag)

    # Print the notes for output
    print(notes, end="")


if __name__ == "__main__":
    main()
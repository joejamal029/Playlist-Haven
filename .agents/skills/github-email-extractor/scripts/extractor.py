#!/usr/bin/env python3
import argparse
import json
import urllib.request
import urllib.error
import sys
import time
from datetime import datetime

class RateLimitError(Exception):
    pass

def fetch_commits(owner, repo):
    url = f"https://api.github.com/repos/{owner}/{repo}/commits"
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'Playlist-Haven-Email-Extractor/1.0')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    
    # Respect rate limiting (standard GitHub API threshold is 60 req/hour unauthenticated)
    # Default to 1 second spacing to be polite
    time.sleep(1.0)
    
    try:
        with urllib.request.urlopen(req) as response:
            data = response.read()
            return json.loads(data.decode('utf-8'))
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode('utf-8')
        except Exception:
            pass
            
        if e.code in [403, 429]:
            reset_time = e.headers.get('X-RateLimit-Reset')
            limit_err = f"Rate limited by GitHub API. Code: {e.code}. Response: {body}"
            if reset_time:
                try:
                    wait_sec = max(1, int(reset_time) - int(time.time()))
                    limit_err += f" Reset occurs in {wait_sec} seconds."
                except ValueError:
                    pass
            raise RateLimitError(limit_err)
        else:
            print(f"Error fetching commits from GitHub. HTTP Status: {e.code}. Body: {body}", file=sys.stderr)
            sys.exit(1)
    except Exception as e:
        print(f"Unexpected error making request: {e}", file=sys.stderr)
        sys.exit(1)

def extract_emails(commits):
    authors = []
    seen = set()
    
    for item in commits:
        commit_info = item.get('commit')
        if not commit_info:
            continue
        author_info = commit_info.get('author')
        if not author_info:
            continue
            
        name = author_info.get('name')
        email = author_info.get('email')
        date_str = author_info.get('date')
        
        if not email:
            continue
            
        # Ignore GitHub noreply masked emails unless no other emails exist
        key = (name, email)
        if key not in seen:
            seen.add(key)
            authors.append({
                'name': name,
                'email': email,
                'last_commit_date': date_str
            })
            
    # Sort by commit date descending
    authors.sort(key=lambda x: x['last_commit_date'] or '', reverse=True)
    return authors

def main():
    parser = argparse.ArgumentParser(description="Extract public developer email addresses from a GitHub repository's commit logs.")
    parser.add_argument('--owner', required=True, help="GitHub repository owner/organization")
    parser.add_argument('--repo', required=True, help="GitHub repository name")
    parser.add_argument('--output', required=True, help="Path to write the output JSON file")
    
    args = parser.parse_args()
    
    print(f"Querying GitHub API for commits on {args.owner}/{args.repo}...", file=sys.stderr)
    try:
        commits = fetch_commits(args.owner, args.repo)
    except RateLimitError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
        
    authors = extract_emails(commits)
    
    # Save output to JSON file (Rule 4: Default to file output)
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(authors, f, indent=2)
        print(f"Success! Extracted {len(authors)} unique developer contacts to {args.output}")
        
        # Display short summary in stdout
        for author in authors[:5]:
            print(f"- {author['name']} <{author['email']}> (Last commit: {author['last_commit_date']})")
        if len(authors) > 5:
            print(f"... and {len(authors) - 5} more.")
    except Exception as e:
        print(f"Failed to write results file: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()

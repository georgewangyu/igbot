#!/usr/bin/env python3
"""Experimental Instagram private/public API collector for igbot.

This bridge keeps unofficial collection out of the Node CLI. It prints a JSON
array of normalized rows to stdout and human-readable errors to stderr.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect public Instagram rows with instagrapi.")
    parser.add_argument("command", choices=["login", "profile", "search", "hashtag", "explore"])
    parser.add_argument("--query", default="")
    parser.add_argument("--username", default="")
    parser.add_argument("--max-results", type=int, default=30)
    parser.add_argument("--session-file", default=os.environ.get("IG_PRIVATE_SESSION_FILE", ""))
    args = parser.parse_args()

    try:
        from instagrapi import Client
    except ModuleNotFoundError:
        print(
            "Missing Python dependency: instagrapi. Run `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`.",
            file=sys.stderr,
        )
        return 2

    client = Client()
    client.delay_range = [1, 3]
    session_path = Path(args.session_file).expanduser() if args.session_file else None
    login_if_configured(client, session_path, force=args.command == "login")

    if args.command == "login":
        rows = [session_status(client, session_path)]
    elif args.command == "profile":
        username = args.username or args.query
        if not username:
            raise ValueError("profile requires --username or --query")
        rows = with_login_retry(client, session_path, lambda: collect_profile(client, username, args.max_results))
    elif args.command == "hashtag":
        if not args.query:
            raise ValueError("hashtag requires --query")
        rows = with_login_retry(client, session_path, lambda: collect_hashtag(client, args.query, args.max_results))
    elif args.command == "search":
        if not args.query:
            raise ValueError("search requires --query")
        rows = with_login_retry(client, session_path, lambda: collect_search(client, args.query, args.max_results))
    elif args.command == "explore":
        rows = with_login_retry(client, session_path, lambda: collect_explore(client, args.max_results))
    else:
        raise ValueError(f"Unsupported command: {args.command}")

    print(json.dumps(rows, ensure_ascii=False))
    return 0


def login_if_configured(client: Any, session_path: Path | None = None, force: bool = False) -> None:
    if session_path and session_path.exists():
        client.load_settings(str(session_path))

    username = os.environ.get("IG_PRIVATE_USERNAME") or os.environ.get("IG_USERNAME")
    password = os.environ.get("IG_PRIVATE_PASSWORD") or os.environ.get("IG_PASSWORD")
    if username and password and force:
        client.login(username, password)
        dump_session(client, session_path)


def with_login_retry(client: Any, session_path: Path | None, operation: Any) -> Any:
    try:
        return operation()
    except Exception as error:
        if not is_login_required(error):
            raise
        relogin(client, session_path)
        return operation()


def is_login_required(error: Exception) -> bool:
    name = error.__class__.__name__.lower()
    text = str(error).lower()
    return "loginrequired" in name or "login_required" in text or "login required" in text


def relogin(client: Any, session_path: Path | None) -> None:
    username = os.environ.get("IG_PRIVATE_USERNAME") or os.environ.get("IG_USERNAME")
    password = os.environ.get("IG_PRIVATE_PASSWORD") or os.environ.get("IG_PASSWORD")
    if not username or not password:
        raise RuntimeError(
            "Instagram returned login_required and no IG_PRIVATE_USERNAME/IG_PRIVATE_PASSWORD are configured."
        )
    if hasattr(client, "relogin"):
        client.relogin()
    else:
        client.login(username, password)
    dump_session(client, session_path)


def dump_session(client: Any, session_path: Path | None) -> None:
    if session_path:
        session_path.parent.mkdir(parents=True, exist_ok=True)
        client.dump_settings(str(session_path))


def session_status(client: Any, session_path: Path | None) -> dict[str, Any]:
    user = client.account_info()
    dump_session(client, session_path)
    return {
        "ok": True,
        "username": getattr(user, "username", ""),
        "pk": str(getattr(user, "pk", "")),
        "sessionFile": str(session_path) if session_path else "",
        "source": "instagrapi_login",
    }


def collect_profile(client: Any, username: str, max_results: int) -> list[dict[str, Any]]:
    user = get_user(client, username)
    medias = client.user_medias(user.pk, amount=max_results)
    return [normalize_media(media, user=user, source="instagrapi_profile") for media in medias[:max_results]]


def collect_hashtag(client: Any, query: str, max_results: int) -> list[dict[str, Any]]:
    tag = query.lstrip("#")
    medias = client.hashtag_medias_reels_v1(tag, amount=max_results)
    return enrich_missing_followers(client, medias[:max_results], source="instagrapi_hashtag")


def collect_search(client: Any, query: str, max_results: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    payload = client.fbsearch_reels_v2(query)
    medias = extract_media_candidates(payload)
    if not medias:
        payload = client.fbsearch_topsearch_v2(query)
        medias = extract_media_candidates(payload)

    for raw in medias[:max_results]:
        media = coerce_media(client, raw)
        if media:
            rows.append(media)
    return enrich_missing_followers(client, rows[:max_results], source="instagrapi_search", already_normalized=True)


def collect_explore(client: Any, max_results: int) -> list[dict[str, Any]]:
    medias = client.explore_reels(amount=max_results)
    return enrich_missing_followers(client, medias[:max_results], source="instagrapi_explore")


def get_user(client: Any, username: str) -> Any:
    username = username.replace("@", "").strip()
    try:
        return client.user_info_by_username_gql(username)
    except Exception:
        return client.user_info_by_username(username)


def enrich_missing_followers(
    client: Any,
    medias: Iterable[Any],
    source: str,
    already_normalized: bool = False,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    user_cache: dict[str, Any] = {}
    for media in medias:
        row = media if already_normalized else normalize_media(media, source=source)
        username = (row.get("creator") or "").replace("@", "")
        if username and not row.get("followers"):
            if username not in user_cache:
                try:
                    user_cache[username] = get_user(client, username)
                except Exception:
                    user_cache[username] = None
            user = user_cache[username]
            if user is not None:
                row["followers"] = number(getattr(user, "follower_count", 0))
        row["source"] = source
        rows.append(row)
    return rows


def extract_media_candidates(value: Any) -> list[Any]:
    found: list[Any] = []

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            if looks_like_media(node):
                found.append(node)
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)

    visit(value)
    return found


def looks_like_media(node: dict[str, Any]) -> bool:
    keys = set(node.keys())
    return bool(
        {"pk", "id", "code"} & keys
        and ({"play_count", "video_view_count", "like_count", "comment_count", "caption"} & keys)
    )


def coerce_media(client: Any, raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return normalize_media(raw, source="instagrapi_search")
    media_pk = raw.get("pk") or raw.get("id")
    try:
        if media_pk:
            return normalize_media(client.media_info(media_pk), source="instagrapi_search")
    except Exception:
        pass
    return normalize_raw_media(raw, source="instagrapi_search")


def normalize_media(media: Any, user: Any = None, source: str = "instagrapi") -> dict[str, Any]:
    creator = getattr(getattr(media, "user", None), "username", "") or getattr(user, "username", "")
    followers = number(getattr(user, "follower_count", 0)) if user is not None else 0
    code = getattr(media, "code", "") or ""
    pk = getattr(media, "pk", "") or getattr(media, "id", "")
    return {
        "platform": "instagram",
        "id": str(pk or code),
        "url": f"https://www.instagram.com/reel/{code}/" if code else "",
        "creator": creator,
        "followers": followers,
        "caption": caption_text(getattr(media, "caption_text", "")),
        "views": first_number(getattr(media, "play_count", None), getattr(media, "view_count", None), 0),
        "likes": number(getattr(media, "like_count", 0)),
        "comments": number(getattr(media, "comment_count", 0)),
        "shares": number(getattr(media, "share_count", 0)),
        "saved": 0,
        "postedAt": iso_time(getattr(media, "taken_at", None)),
        "durationSeconds": number(getattr(media, "video_duration", 0), None),
        "mediaType": str(getattr(media, "media_type", "") or ""),
        "mediaProductType": str(getattr(media, "product_type", "") or ""),
        "source": source,
    }


def normalize_raw_media(raw: dict[str, Any], source: str = "instagrapi") -> dict[str, Any]:
    user = raw.get("user") or raw.get("owner") or {}
    caption = raw.get("caption")
    if isinstance(caption, dict):
        caption = caption.get("text") or caption.get("caption") or ""
    return {
        "platform": "instagram",
        "id": str(raw.get("pk") or raw.get("id") or raw.get("code") or ""),
        "url": f"https://www.instagram.com/reel/{raw.get('code')}/" if raw.get("code") else "",
        "creator": user.get("username") if isinstance(user, dict) else "",
        "followers": 0,
        "caption": caption_text(caption or raw.get("caption_text") or ""),
        "views": first_number(raw.get("play_count"), raw.get("video_view_count"), raw.get("view_count"), 0),
        "likes": number(raw.get("like_count", 0)),
        "comments": number(raw.get("comment_count", 0)),
        "shares": number(raw.get("share_count", 0)),
        "saved": 0,
        "postedAt": iso_time(raw.get("taken_at") or raw.get("taken_at_ts")),
        "durationSeconds": number(raw.get("video_duration", 0), None),
        "mediaType": str(raw.get("media_type") or ""),
        "mediaProductType": str(raw.get("product_type") or ""),
        "source": source,
    }


def caption_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return str(value.get("text") or value.get("caption") or "")
    return str(value or "")


def first_number(*values: Any) -> int:
    for value in values:
        parsed = number(value, None)
        if parsed is not None:
            return parsed
    return 0


def number(value: Any, fallback: Any = 0) -> Any:
    if value is None or value == "":
        return fallback
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def iso_time(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat()
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
    return str(value)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"Instagram bridge error: {exc}", file=sys.stderr)
        raise SystemExit(1)

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from instagrapi_bridge import collect_profile, fail_closed_on_login_required, prepare_client


class LoginRequired(Exception):
    pass


class FakeClient:
    def __init__(self) -> None:
        self.login_calls: list[tuple[str, str, bool]] = []
        self.dump_calls: list[str] = []
        self.load_calls: list[str] = []

    def login(self, username: str, password: str, relogin: bool = False) -> bool:
        self.login_calls.append((username, password, relogin))
        return True

    def dump_settings(self, path: str) -> None:
        self.dump_calls.append(path)

    def load_settings(self, path: str) -> None:
        self.load_calls.append(path)


class AuthenticationBoundaryTests(unittest.TestCase):
    def test_explicit_login_writes_session_once(self) -> None:
        client = FakeClient()
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "session.json"
            with patch.dict(
                os.environ,
                {"IG_PRIVATE_USERNAME": "example", "IG_PRIVATE_PASSWORD": "secret"},
                clear=True,
            ):
                prepare_client(client, session_path, auth_mode="login", command="login")

        self.assertEqual(client.login_calls, [("example", "secret", False)])
        self.assertEqual(client.dump_calls, [str(session_path)])

    def test_login_required_fails_closed_without_retry_or_login(self) -> None:
        attempts = 0

        def operation() -> str:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise LoginRequired("login_required")
            return "ok"

        with self.assertRaisesRegex(RuntimeError, "fail closed"):
            fail_closed_on_login_required(operation)
        self.assertEqual(attempts, 1)

    def test_explicit_login_requires_credentials(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "requires IG_PRIVATE_USERNAME"):
                prepare_client(FakeClient(), None, auth_mode="login", command="login")

    def test_session_mode_requires_existing_session(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "missing.json"
            with self.assertRaisesRegex(RuntimeError, "session file is missing"):
                prepare_client(FakeClient(), session_path, auth_mode="session", command="profile")

    def test_anonymous_mode_ignores_configured_credentials_and_session(self) -> None:
        client = FakeClient()
        with patch.dict(
            os.environ,
            {"IG_PRIVATE_USERNAME": "example", "IG_PRIVATE_PASSWORD": "secret"},
            clear=True,
        ):
            prepare_client(client, Path("session.json"), auth_mode="anonymous", command="profile")
        self.assertEqual(client.login_calls, [])
        self.assertEqual(client.load_calls, [])
        self.assertEqual(client.dump_calls, [])


class ProfileCollectionTests(unittest.TestCase):
    def test_profile_prefers_reels_endpoint(self) -> None:
        class User:
            pk = "123"
            username = "example"
            follower_count = 10

        class Client:
            def __init__(self) -> None:
                self.calls: list[str] = []

            def user_info_by_username_gql(self, username: str) -> User:
                return User()

            def user_clips(self, user_id: str, amount: int = 0) -> list[object]:
                self.calls.append("clips")
                return []

            def user_medias(self, user_id: str, amount: int = 0) -> list[object]:
                self.calls.append("medias")
                return []

        client = Client()
        self.assertEqual(collect_profile(client, "example", 5), [])
        self.assertEqual(client.calls, ["clips"])

    def test_profile_falls_back_to_general_media(self) -> None:
        class User:
            pk = "123"
            username = "example"
            follower_count = 10

        class Client:
            def __init__(self) -> None:
                self.calls: list[str] = []

            def user_info_by_username_gql(self, username: str) -> User:
                return User()

            def user_clips(self, user_id: str, amount: int = 0) -> list[object]:
                self.calls.append("clips")
                raise RuntimeError("clips unavailable")

            def user_medias(self, user_id: str, amount: int = 0) -> list[object]:
                self.calls.append("medias")
                return []

        client = Client()
        self.assertEqual(collect_profile(client, "example", 5), [])
        self.assertEqual(client.calls, ["clips", "medias"])


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from instagrapi_bridge import relogin, with_login_retry


class LoginRequired(Exception):
    pass


class FakeClient:
    def __init__(self) -> None:
        self.login_calls: list[tuple[str, str, bool]] = []
        self.dump_calls: list[str] = []

    def login(self, username: str, password: str, relogin: bool = False) -> bool:
        self.login_calls.append((username, password, relogin))
        return True

    def dump_settings(self, path: str) -> None:
        self.dump_calls.append(path)


class ReloginTests(unittest.TestCase):
    def test_relogin_passes_environment_credentials_explicitly(self) -> None:
        client = FakeClient()
        with tempfile.TemporaryDirectory() as directory:
            session_path = Path(directory) / "session.json"
            with patch.dict(
                os.environ,
                {"IG_PRIVATE_USERNAME": "example", "IG_PRIVATE_PASSWORD": "secret"},
                clear=True,
            ):
                relogin(client, session_path)

        self.assertEqual(client.login_calls, [("example", "secret", True)])
        self.assertEqual(client.dump_calls, [str(session_path)])

    def test_login_required_retries_operation_once(self) -> None:
        client = FakeClient()
        attempts = 0

        def operation() -> str:
            nonlocal attempts
            attempts += 1
            if attempts == 1:
                raise LoginRequired("login_required")
            return "ok"

        with patch.dict(
            os.environ,
            {"IG_PRIVATE_USERNAME": "example", "IG_PRIVATE_PASSWORD": "secret"},
            clear=True,
        ):
            result = with_login_retry(client, None, operation)

        self.assertEqual(result, "ok")
        self.assertEqual(attempts, 2)
        self.assertEqual(client.login_calls, [("example", "secret", True)])

    def test_relogin_requires_credentials(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, "no IG_PRIVATE_USERNAME"):
                relogin(FakeClient(), None)


if __name__ == "__main__":
    unittest.main()

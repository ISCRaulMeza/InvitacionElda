"""Pruebas de integración para la numeración en una copia temporal de la API."""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / "src/server/api/rsvp.php"
PASSWORD = "ci-only-password"


def request(url: str, payload: dict, expected_status: int = 200) -> dict:
    encoded = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url, data=encoded, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=3) as response:
            status = response.status
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        status = exc.code
        result = json.load(exc)
    assert status == expected_status, (status, expected_status, payload, result)
    assert result.get("ok") == (expected_status < 400), result
    return result


def verify_contiguous(attendees: list[dict], end: int) -> None:
    numbers = [item["number"] for item in attendees if item["number"] >= 7]
    assert numbers == list(range(7, end + 1)), numbers


def main() -> None:
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        source = SOURCE.read_text(encoding="utf-8")
        test_hash = hashlib.sha256(PASSWORD.encode()).hexdigest()
        source, replacements = re.subn(
            r"(?<=const ADMIN_PASSWORD_HASH = ')[a-f0-9]{64}(?=';)",
            test_hash,
            source,
            count=1,
        )
        assert replacements == 1
        (root / "rsvp.php").write_text(source, encoding="utf-8")
        (root / "data").mkdir()
        with (root / "data/attendees.csv").open("w", encoding="utf-8") as csv:
            csv.write("number,name,confirmed_at,request_id\n")
            for number in [*range(7, 26), 27, 28, 29]:
                csv.write(
                    f"{number},Guest{number},2026-10-10 09:00:00,req-{number:08d}\n"
                )

        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        url = f"http://127.0.0.1:{port}/rsvp.php"
        with (root / "server.log").open("w") as log:
            server = subprocess.Popen(
                ["php", "-S", f"127.0.0.1:{port}", "-t", str(root)],
                stdout=log,
                stderr=subprocess.STDOUT,
            )
            try:
                for _ in range(50):
                    try:
                        request(url, {"action": "health"})
                        break
                    except (urllib.error.URLError, TimeoutError):
                        time.sleep(0.1)
                else:
                    raise AssertionError("El servidor PHP no inició")

                def attendees() -> list[dict]:
                    return request(url, {"action": "list", "password": PASSWORD})[
                        "attendees"
                    ]

                assert [x["number"] for x in attendees()][-5:] == [
                    24, 25, 27, 28, 29
                ]
                repaired = request(
                    url, {"action": "renumber", "password": PASSWORD}
                )
                assert repaired["renumberedCount"] == 3
                verify_contiguous(attendees(), 28)

                deleted = request(
                    url,
                    {
                        "action": "delete",
                        "password": PASSWORD,
                        "number": 25,
                        "name": "Guest25",
                    },
                )
                assert deleted["renumberedCount"] == 3
                verify_contiguous(attendees(), 27)
                assert next(x for x in attendees() if x["number"] == 25)["name"] == "Guest27"

                request(
                    url,
                    {
                        "action": "delete",
                        "password": PASSWORD,
                        "number": 25,
                        "name": "Guest25",
                    },
                    expected_status=409,
                )
                assert next(x for x in attendees() if x["number"] == 25)["name"] == "Guest27"

                # Las solicitudes repetidas deben devolver el dorsal actualizado.
                duplicate = request(
                    url,
                    {
                        "action": "confirm",
                        "name": "Guest28",
                        "requestId": "req-00000028",
                    },
                    expected_status=201,
                )
                assert duplicate["number"] == 26

                added = request(
                    url,
                    {"action": "confirm", "name": "New Guest", "requestId": "req-new-0001"},
                    expected_status=201,
                )
                assert added["number"] == 28

                request(
                    url,
                    {
                        "action": "manual-add",
                        "password": PASSWORD,
                        "name": "Invalid Gap",
                        "number": 99,
                        "requestId": "req-gap-0001",
                    },
                    expected_status=422,
                )
                assert len(attendees()) == 22

                reserved = request(
                    url,
                    {
                        "action": "manual-add",
                        "password": PASSWORD,
                        "name": "Reserved Guest",
                        "number": 1,
                        "requestId": "req-reserved-01",
                    },
                    expected_status=201,
                )
                assert reserved["number"] == 1

                manual = request(
                    url,
                    {
                        "action": "manual-add",
                        "password": PASSWORD,
                        "name": "Manual Guest",
                        "number": 29,
                        "requestId": "req-manual-001",
                    },
                    expected_status=201,
                )
                assert manual["number"] == 29
                verify_contiguous(attendees(), 29)

                numbers = [x["number"] for x in attendees()]
                request(
                    url,
                    {
                        "action": "reorder",
                        "password": PASSWORD,
                        "order": list(reversed(numbers)),
                    },
                )
                reordered = attendees()
                assert reordered[0]["number"] == 1
                verify_contiguous(reordered, 29)

                request(
                    url,
                    {
                        "action": "delete",
                        "password": PASSWORD,
                        "number": 1,
                        "name": "Manual Guest",
                    },
                )
                verify_contiguous(attendees(), 29)

                print("Correcto: reparación, eliminación, altas, idempotencia, reservas y reordenación.")
            finally:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)


if __name__ == "__main__":
    if shutil.which("php") is None:
        raise SystemExit("PHP no está disponible")
    main()

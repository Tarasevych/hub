#!/usr/bin/env python3
"""Drop the warning that the backup service is broken, once it can run."""
import sys
from pathlib import Path

root = Path(sys.argv[1])
repls = [
    (
        "випуск іде без копії. Служба копії зараз падає, тож лишайте вимкненим.",
        "випуск іде без копії.",
    ),
    (
        "de release gaat zonder kopie. De kopiedienst faalt nu, laat dit uit.",
        "de release gaat zonder kopie.",
    ),
    (
        "Увімкнути резервну копію? Служба зараз падає, і наступний випуск зупиниться.",
        "Увімкнути резервну копію? Перед випуском запуститься копія. Якщо вона не вдасться, випуск зупиниться.",
    ),
    (
        "Reservekopie aanzetten? De dienst faalt nu, en de volgende release stopt.",
        "Reservekopie aanzetten? Vóór de release start de kopie. Lukt die niet, dan stopt de release.",
    ),
    (
        "Лишайте вимкненим, доки служба копії не запрацює. Увімкнено зупиняє наступний випуск, якщо копія падає.",
        "Увімкнено: перед випуском запускається копія. Якщо вона падає, випуск зупиняється. Вимкнено: випуск іде без копії.",
    ),
    (
        "Laat uit tot de kopiedienst werkt. Aan stopt de volgende release als de kopie faalt.",
        "Aan: vóór een release start de kopie. Faalt die, dan stopt de release. Uit: de release gaat zonder kopie.",
    ),
]
for rel in ("src/McpServiceView.tsx", "backend/mcp-console.ts"):
    path = root / rel
    if not path.is_file():
        print(f"missing {rel}")
        continue
    text = path.read_text()
    n = 0
    for old, new in repls:
        if old in text:
            text = text.replace(old, new)
            n += 1
    if n:
        path.write_text(text)
        print(f"patched {rel} {n}")
    else:
        print(f"already {rel}")

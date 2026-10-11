"""
Realistische Testdaten für die beiden Testfirmen (Honestas Capital GmbH,
Musterbau GmbH): Arbeitszeiten 1. 1. – 9. 10. 2026, Abwesenheiten und ein
dazu passendes Änderungsprotokoll.

Schreibt mehrere SQL-Dateien (je Person eine), die jeweils in einer
Transaktion mit app.purge = on laufen: dann schreiben die Trigger kein
eigenes Protokoll, und das hier erzeugte bekommt realistische Zeitpunkte und
Urheber.

Löscht vorher alle Zeiten, Abwesenheiten und das Protokoll der beiden
Testfirmen — nie gegen eine Datenbank mit echten Kunden ausführen.

    python scripts/testdaten.py <ausgabeordner>
    npx supabase db query --linked -f <ausgabeordner>/00_setup.sql
    (danach die übrigen Dateien der Reihe nach)
"""

import json
import random
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

ORG_H = 'd4087c5a-e518-45b7-bed3-dfd73d4145f5'
ORG_M = '2c7f8a6c-7a40-4ada-85c5-24ad6bd602e5'
MARLENE = '11111111-1111-1111-1111-111111111111'
ANNA = '22222222-2222-2222-2222-222222222222'
SOFIA = '33333333-3333-3333-3333-333333333333'
JONAS = '44444444-4444-4444-4444-444444444444'
BERNHARD = '55555555-5555-5555-5555-555555555555'
LISA = '66666666-6666-6666-6666-666666666666'
MARKUS = '77777777-7777-7777-7777-777777777777'

NOW = datetime(2026, 10, 11, 22, 0, tzinfo=timezone.utc)
START = date(2026, 1, 1)
END = date(2026, 10, 9)

HOLIDAYS = {
    date(2026, 1, 1), date(2026, 1, 6), date(2026, 4, 6), date(2026, 5, 1),
    date(2026, 5, 14), date(2026, 5, 25), date(2026, 6, 4), date(2026, 8, 15),
}

# Österreichische Ortszeit: Sommerzeit 29. 3. bis 25. 10. 2026.
DST_START = datetime(2026, 3, 29, 1, 0, tzinfo=timezone.utc)
DST_END = datetime(2026, 10, 25, 1, 0, tzinfo=timezone.utc)


def vienna(day: date, minutes: int) -> datetime:
    """Ortszeit (Minuten nach Mitternacht) → UTC."""
    naive = datetime(day.year, day.month, day.day) + timedelta(minutes=minutes)
    guess = naive.replace(tzinfo=timezone.utc) - timedelta(hours=1)
    offset = 2 if DST_START <= guess < DST_END else 1
    return naive.replace(tzinfo=timezone.utc) - timedelta(hours=offset)


def iso(moment: datetime | None) -> str | None:
    return None if moment is None else moment.strftime('%Y-%m-%dT%H:%M:%S+00:00')


def hm(text: str) -> int:
    h, m = text.split(':')
    return int(h) * 60 + int(m)


def days_between(first: date, last: date):
    current = first
    while current <= last:
        yield current
        current += timedelta(days=1)


def span(first: str, last: str) -> set[date]:
    return set(days_between(date.fromisoformat(first), date.fromisoformat(last)))


def q(value) -> str:
    if value is None:
        return 'null'
    return "'" + str(value).replace("'", "''") + "'"


class Person:
    def __init__(self, pid, org, admin, seed):
        self.id = pid
        self.org = org
        self.admin = admin  # wer für diese Person korrigiert und Urlaub einträgt
        self.rng = random.Random(seed)
        self.entries = []   # Zeilen für time_entries
        self.absences = []  # Zeilen für absences
        self.audit = []     # Zeilen für audit_log

    # --- Protokoll ----------------------------------------------------------

    def log(self, table, record_id, operation, old, new, by, at):
        self.audit.append((table, record_id, self.id, self.org, operation, old, new, by, iso(at)))

    # --- Zeiten ----------------------------------------------------------------

    def row(self, day, start, end, kind, source, note, by, created):
        return {
            'id': str(uuid.UUID(int=self.rng.getrandbits(128))),
            'organization_id': self.org,
            'employee_id': self.id,
            'work_date': day.isoformat(),
            'started_at': iso(start),
            'ended_at': iso(end),
            'kind': kind,
            'note': note,
            'source': source,
            'created_at': iso(created),
            'created_by': by,
            'updated_at': iso(created),
            'updated_by': by,
        }

    def stamped(self, day, segments, forgot_end=False, fixer=None, fix_note=None):
        """Gestempelter Tag: je Abschnitt Ein- und Ausstempeln zur echten Zeit.

        forgot_end: der letzte Abschnitt bleibt offen und wird am nächsten
        Morgen von `fixer` nachgetragen.
        """
        for index, (kind, start, end) in enumerate(segments):
            s, e = vienna(day, start), vienna(day, end)
            last = index == len(segments) - 1
            open_row = self.row(day, s, None, kind, 'stamped', None, self.id, s)
            self.log('time_entries', open_row['id'], 'INSERT', None, dict(open_row), self.id, s)
            when = vienna(day + timedelta(days=1 if day.weekday() < 4 else 3), hm('07:55') + self.rng.randint(0, 50))
            # Eine Korrektur, die erst in der Zukunft läge, gibt es noch nicht.
            if last and forgot_end and when < NOW:
                closed = dict(open_row, ended_at=iso(e), source='manual', note=fix_note,
                              updated_at=iso(when), updated_by=fixer)
                self.log('time_entries', open_row['id'], 'UPDATE', dict(open_row), dict(closed), fixer, when)
                self.entries.append(closed)
            else:
                closed = dict(open_row, ended_at=iso(e), updated_at=iso(e))
                self.log('time_entries', open_row['id'], 'UPDATE', dict(open_row), dict(closed), self.id, e)
                self.entries.append(closed)

    def manual(self, day, segments, by, when, note=None):
        """Nachgetragener Tag: alle Abschnitte auf einmal, zum Zeitpunkt `when`."""
        for index, (kind, start, end) in enumerate(segments):
            row = self.row(day, vienna(day, start), vienna(day, end), kind, 'manual',
                           note if index == 0 else None, by, when)
            self.log('time_entries', row['id'], 'INSERT', None, dict(row), by, when)
            self.entries.append(row)
            when = when + timedelta(seconds=40)

    def late_start_corrected(self, day, segments, stamped_at, by, note):
        """Zu spät eingestempelt; die Verwaltung setzt den Beginn zurück."""
        kind, start, end = segments[0]
        s_wrong = vienna(day, stamped_at)
        open_row = self.row(day, s_wrong, None, kind, 'stamped', None, self.id, s_wrong)
        self.log('time_entries', open_row['id'], 'INSERT', None, dict(open_row), self.id, s_wrong)
        e = vienna(day, end)
        closed = dict(open_row, ended_at=iso(e), updated_at=iso(e))
        self.log('time_entries', open_row['id'], 'UPDATE', dict(open_row), dict(closed), self.id, e)
        when = vienna(day, end + self.rng.randint(5, 40))
        fixed = dict(closed, started_at=iso(vienna(day, start)), source='manual', note=note,
                     updated_at=iso(when), updated_by=by)
        self.log('time_entries', open_row['id'], 'UPDATE', dict(closed), dict(fixed), by, when)
        self.entries.append(fixed)
        if len(segments) > 1:
            self.stamped(day, segments[1:])

    def double_stamp(self, day, at):
        """Versehentlich zweimal gestempelt; der überzählige Abschnitt wird gelöscht."""
        s = vienna(day, at)
        row = self.row(day, s, None, 'work', 'stamped', None, self.id, s)
        self.log('time_entries', row['id'], 'INSERT', None, dict(row), self.id, s)
        self.log('time_entries', row['id'], 'DELETE', dict(row), None, self.id, s + timedelta(seconds=50))

    # --- Abwesenheiten ------------------------------------------------------

    def absence(self, day, kind, by, when, note=None, half=False):
        row = {
            'id': str(uuid.UUID(int=self.rng.getrandbits(128))),
            'organization_id': self.org,
            'employee_id': self.id,
            'absence_date': day.isoformat(),
            'kind': kind,
            'half_day': half,
            'note': note,
            'announced_on': None,
            'created_at': iso(when),
            'created_by': by,
            'updated_at': iso(when),
            'updated_by': by,
        }
        self.absences.append(row)
        self.log('absences', row['id'], 'INSERT', None, dict(row), by, when)


def workdays(person_absent: set[date]):
    for day in days_between(START, END):
        if day.weekday() >= 5 or day in HOLIDAYS or day in person_absent:
            continue
        yield day


def jitter(rng, base, spread):
    return base + rng.randint(-spread, spread)


def plan_absences(person, blocks, by, lead_days=21):
    """blocks: [(von, bis, art, notiz)] — eingetragen vorab bzw. am ersten Tag."""
    absent = set()
    for first, last, kind, note in blocks:
        days = [d for d in sorted(span(first, last)) if d.weekday() < 5 and d not in HOLIDAYS]
        if kind == 'krankenstand':
            when = vienna(days[0], hm('08:20') + person.rng.randint(0, 40))
        else:
            when = vienna(days[0] - timedelta(days=lead_days), hm('10:00') + person.rng.randint(0, 300))
        for day in days:
            person.absence(day, kind, by, when, note if day == days[0] else None)
            when += timedelta(seconds=20)
            absent.add(day)
    return absent


# ---------------------------------------------------------------------------
# Personen
# ---------------------------------------------------------------------------

people = []

# Anna Berger — Vollzeit mit Gleitzeit, 7:42 am Tag, meist gestempelt.
anna = Person(ANNA, ORG_H, MARKUS, 1)
absent = plan_absences(anna, [
    ('2026-02-23', '2026-02-27', 'urlaub', 'Semesterferien'),
    ('2026-03-09', '2026-03-11', 'krankenstand', 'Krankmeldung telefonisch'),
    ('2026-05-15', '2026-05-15', 'urlaub', 'Fenstertag'),
    ('2026-08-03', '2026-08-14', 'urlaub', None),
    ('2026-10-02', '2026-10-02', 'urlaub', None),
], MARKUS)
missing = {date(2026, 4, 22), date(2026, 9, 18)}
for i, day in enumerate(workdays(absent)):
    rng = anna.rng
    if day in missing:
        continue
    start = jitter(rng, hm('07:55'), 25)
    work = jitter(rng, 470, 30) - (35 if day.weekday() == 4 else -8)
    pause_at = start + jitter(rng, 255, 20)
    pause = rng.choice([30, 30, 35, 45])
    end = start + work + pause
    segs = [('work', start, pause_at), ('break', pause_at, pause_at + pause), ('work', pause_at + pause, end)]
    roll = rng.random()
    if roll < 0.05:
        anna.stamped(day, segs, forgot_end=True, fixer=ANNA, fix_note='Ausstempeln vergessen')
    elif roll < 0.08:
        anna.manual(day, segs, ANNA, vienna(day + timedelta(days=1 if day.weekday() < 4 else 3), hm('08:05')),
                    'Handy vergessen, nachgetragen')
    else:
        anna.stamped(day, segs)
people.append(anna)

# Sofia Wagner — Teilzeit 20 h, vormittags vier Stunden, ohne Pause.
sofia = Person(SOFIA, ORG_H, MARKUS, 2)
absent = plan_absences(sofia, [
    ('2026-04-14', '2026-04-16', 'krankenstand', 'Krankmeldung per E-Mail'),
    ('2026-06-05', '2026-06-05', 'urlaub', 'Fenstertag'),
    ('2026-07-13', '2026-07-24', 'urlaub', None),
    ('2026-09-11', '2026-09-11', 'pflegefreistellung', 'Kind krank'),
], MARKUS)
missing = {date(2026, 3, 19)}
for day in workdays(absent):
    rng = sofia.rng
    if day in missing:
        continue
    start = jitter(rng, hm('08:05'), 10)
    end = start + 240 + rng.choice([0, 0, 0, 5, 10, 30])
    segs = [('work', start, end)]
    roll = rng.random()
    if roll < 0.04:
        sofia.stamped(day, segs, forgot_end=True, fixer=MARKUS, fix_note='Laut Rücksprache bis Mittag gearbeitet')
    else:
        sofia.stamped(day, segs)
people.append(sofia)

# Jonas Steiner — Lehrling, bis 17. 9. unter 18: höchstens 8 Stunden.
jonas = Person(JONAS, ORG_H, MARKUS, 3)
absent = plan_absences(jonas, [
    ('2026-02-12', '2026-02-13', 'krankenstand', 'Krankmeldung über die Mutter'),
    ('2026-03-02', '2026-03-20', 'dienstfreistellung', 'Lehrgang Berufsschule'),
    ('2026-07-27', '2026-08-07', 'urlaub', None),
], MARKUS, lead_days=40)
missing = {date(2026, 6, 19), date(2026, 9, 25)}
for day in workdays(absent):
    rng = jonas.rng
    if day in missing:
        continue
    start = jitter(rng, hm('07:30'), 6)
    pause_at = start + 240
    end = start + 480 + 30
    segs = [('work', start, pause_at), ('break', pause_at, pause_at + 30), ('work', pause_at + 30, end)]
    roll = rng.random()
    if roll < 0.04:
        jonas.late_start_corrected(day, segs, start + rng.randint(90, 160), MARKUS,
                                   'Einstempeln vergessen, Beginn laut Ausbilder')
    elif roll < 0.09:
        jonas.stamped(day, segs, forgot_end=True, fixer=MARKUS, fix_note='Ausstempeln vergessen')
    elif roll < 0.11:
        jonas.double_stamp(day, start)
        jonas.stamped(day, segs)
    else:
        jonas.stamped(day, segs)
people.append(jonas)

# Markus Leitner — Verwaltung, Vollzeit ohne Gleitzeit, gelegentlich länger.
markus = Person(MARKUS, ORG_H, MARLENE, 4)
absent = plan_absences(markus, [
    ('2026-01-20', '2026-01-20', 'krankenstand', None),
    ('2026-03-30', '2026-04-03', 'urlaub', 'Osterwoche'),
    ('2026-07-06', '2026-07-17', 'urlaub', None),
], MARLENE)
missing = {date(2026, 6, 12)}
for day in workdays(absent):
    rng = markus.rng
    if day in missing:
        continue
    start = jitter(rng, hm('08:00'), 10)
    long_day = rng.random() < 0.06
    work = 462 + (rng.randint(60, 120) if long_day else rng.randint(-15, 10))
    pause_at = start + jitter(rng, 270, 20)
    pause = 30
    segs = [('work', start, pause_at), ('break', pause_at, pause_at + pause), ('work', pause_at + pause, start + work + pause)]
    if rng.random() < 0.03:
        markus.stamped(day, segs, forgot_end=True, fixer=MARKUS, fix_note='Ausstempeln vergessen')
    else:
        markus.stamped(day, segs)
people.append(markus)

# Marlene Hofer — Inhaberin, leitend, vom AZG ausgenommen: lange Tage,
# häufiger am Freitag für die ganze Woche nachgetragen.
marlene = Person(MARLENE, ORG_H, MARLENE, 5)
absent = plan_absences(marlene, [
    ('2026-01-02', '2026-01-02', 'urlaub', 'Fenstertag'),
    ('2026-05-15', '2026-05-15', 'urlaub', 'Fenstertag'),
    ('2026-08-24', '2026-09-04', 'urlaub', None),
], MARLENE)
missing = {date(2026, 2, 6), date(2026, 5, 29), date(2026, 7, 3)}
week_buffer = []


def flush_marlene():
    global week_buffer
    if not week_buffer:
        return
    first = week_buffer[0][0]
    friday = first + timedelta(days=4 - first.weekday())
    when = vienna(friday, hm('17:40') + marlene.rng.randint(0, 40))
    for d, s in week_buffer:
        marlene.manual(d, s, MARLENE, when)
        when += timedelta(minutes=1)
    week_buffer = []


for day in workdays(absent):
    rng = marlene.rng
    if week_buffer and day.isocalendar().week != week_buffer[0][0].isocalendar().week:
        flush_marlene()
    if day in missing:
        continue
    start = jitter(rng, hm('08:30'), 20)
    work = rng.randint(510, 600)
    pause_at = start + jitter(rng, 240, 30)
    pause = 45
    segs = [('work', start, pause_at), ('break', pause_at, pause_at + pause), ('work', pause_at + pause, start + work + pause)]
    if day.isocalendar().week % 3 == 0:
        week_buffer.append((day, segs))
    else:
        marlene.stamped(day, segs)
flush_marlene()
people.append(marlene)

# Bernhard Gruber — Musterbau, Inhaber: trägt jeden Freitag die Woche nach.
bernhard = Person(BERNHARD, ORG_M, BERNHARD, 6)
absent = plan_absences(bernhard, [
    ('2026-08-03', '2026-08-14', 'urlaub', None),
], BERNHARD, lead_days=60)
week_buffer = []
missing = {date(2026, 9, 7)}
for day in workdays(absent):
    rng = bernhard.rng
    if day not in missing:
        start = jitter(rng, hm('07:00'), 10)
        pause_at = start + 300
        segs = [('work', start, pause_at), ('break', pause_at, pause_at + 30), ('work', pause_at + 30, start + 480 + 30 + rng.choice([0, 0, 0, 0, 30]))]
        week_buffer.append((day, segs))
    if day.weekday() == 4 and week_buffer:
        when = vienna(day, hm('15:45') + rng.randint(0, 30))
        for d, s in week_buffer:
            bernhard.manual(d, s, BERNHARD, when)
            when += timedelta(minutes=1)
        week_buffer = []
for d, s in week_buffer:
    bernhard.manual(d, s, BERNHARD, vienna(END, hm('15:50')))
people.append(bernhard)

# Lisa Mayr — Musterbau, Vollzeit, gestempelt.
lisa = Person(LISA, ORG_M, BERNHARD, 7)
absent = plan_absences(lisa, [
    ('2026-02-16', '2026-02-16', 'krankenstand', None),
    ('2026-05-26', '2026-05-29', 'urlaub', None),
    ('2026-08-10', '2026-08-21', 'urlaub', None),
], BERNHARD)
missing = {date(2026, 4, 30), date(2026, 10, 1)}
for day in workdays(absent):
    rng = lisa.rng
    if day in missing:
        continue
    start = jitter(rng, hm('07:00'), 8)
    pause_at = start + jitter(rng, 300, 15)
    segs = [('work', start, pause_at), ('break', pause_at, pause_at + 30), ('work', pause_at + 30, start + 480 + 30 + rng.randint(-5, 15))]
    roll = rng.random()
    if roll < 0.03:
        lisa.double_stamp(day, start)
        lisa.stamped(day, segs)
    elif roll < 0.06:
        lisa.stamped(day, segs, forgot_end=True, fixer=BERNHARD, fix_note='Ausstempeln vergessen')
    else:
        lisa.stamped(day, segs)
people.append(lisa)


# ---------------------------------------------------------------------------
# SQL
# ---------------------------------------------------------------------------

ENTRY_COLS = ['id', 'organization_id', 'employee_id', 'work_date', 'started_at', 'ended_at', 'kind', 'note',
              'source', 'created_at', 'created_by', 'updated_at', 'updated_by']
ABSENCE_COLS = ['id', 'organization_id', 'employee_id', 'absence_date', 'kind', 'half_day', 'note', 'announced_on',
                'created_at', 'created_by', 'updated_at', 'updated_by']


def chunks(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def jq(value):
    return 'null' if value is None else q(json.dumps(value, ensure_ascii=False)) + '::jsonb'


HEAD = "begin;\nselect set_config('app.purge', 'on', true);\n"
TAIL = "commit;\n"

# 00: Aufräumen und Stammdaten-Protokoll
orgs = f"({q(ORG_H)}, {q(ORG_M)})"
setup = [HEAD,
         f"delete from audit_log where organization_id in {orgs};\n",
         f"delete from time_entries where organization_id in {orgs};\n",
         f"delete from absences where organization_id in {orgs};\n"]

# Anlage der Zugänge im Dezember 2025 — wer wen wann angelegt hat.
created = [
    (MARLENE, None, '2025-12-10 09:12', ['personnel_number'], 'admin'),
    (MARKUS, MARLENE, '2025-12-15 10:03', [], 'admin'),
    (ANNA, MARKUS, '2025-12-16 09:41', ['personnel_number'], 'employee'),
    (SOFIA, MARKUS, '2025-12-16 09:52', [], 'employee'),
    (JONAS, MARKUS, '2025-12-16 10:05', ['birth_date'], 'employee'),
    (BERNHARD, None, '2025-12-12 14:20', [], 'admin'),
    (LISA, BERNHARD, '2025-12-18 08:15', ['vacation_opening_days', 'vacation_opening_date'], 'employee'),
]
for pid, by, at, missing_fields, role in created:
    at_utc = f"timestamptz {q(at + ' Europe/Vienna')}"
    blank = 'to_jsonb(p)'
    for field in missing_fields:
        blank = f"jsonb_set({blank}, '{{{field}}}', 'null')"
    by_sql = q(by) if by else 'null'
    if by:
        setup.append(
            "insert into audit_log (table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by, changed_at)\n"
            f"select 'auth.users', p.id, p.id, p.organization_id, 'INSERT', null, jsonb_build_object('aktion', 'zugang_angelegt', 'rolle', {q(role)}), {by_sql}, {at_utc}\n"
            f"from profiles p where p.id = {q(pid)};\n")
    setup.append(
        "insert into audit_log (table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by, changed_at)\n"
        f"select 'profiles', p.id, p.id, p.organization_id, 'INSERT', null, {blank}, {by_sql}, {at_utc} + interval '20 seconds'\n"
        f"from profiles p where p.id = {q(pid)};\n")
    setup.append(
        "insert into audit_log (table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by, changed_at)\n"
        f"select 'employment_contracts', c.id, c.employee_id, c.organization_id, 'INSERT', null, to_jsonb(c), {by_sql}, {at_utc} + interval '45 seconds'\n"
        f"from employment_contracts c where c.employee_id = {q(pid)};\n")

# Spätere Änderungen an Mitarbeiterdaten — der Endstand ist der heutige.
later = [
    (JONAS, MARKUS, '2026-01-08 11:30', ['birth_date']),
    (ANNA, MARKUS, '2026-02-03 14:12', ['personnel_number']),
    (MARLENE, MARLENE, '2026-01-12 08:47', ['personnel_number']),
    (LISA, BERNHARD, '2026-01-09 16:05', ['vacation_opening_days', 'vacation_opening_date']),
]
for pid, by, at, fields in later:
    old = 'to_jsonb(p)'
    for field in fields:
        old = f"jsonb_set({old}, '{{{field}}}', 'null')"
    setup.append(
        "insert into audit_log (table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by, changed_at)\n"
        f"select 'profiles', p.id, p.id, p.organization_id, 'UPDATE', {old}, to_jsonb(p), {q(by)}, timestamptz {q(at + ' Europe/Vienna')}\n"
        f"from profiles p where p.id = {q(pid)};\n")

# Passwort von der Verwaltung neu gesetzt (Jonas hatte es vergessen).
setup.append(
    "insert into audit_log (table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by, changed_at)\n"
    f"values ('auth.users', {q(JONAS)}, {q(JONAS)}, {q(ORG_H)}, 'UPDATE', null, jsonb_build_object('aktion', 'passwort_gesetzt'), {q(MARKUS)}, timestamptz '2026-04-14 07:42 Europe/Vienna');\n")
setup.append(TAIL)
(OUT / '00_setup.sql').write_text(''.join(setup), encoding='utf-8')

summary = []
for number, person in enumerate(people, start=1):
    parts = [HEAD]
    for chunk in chunks(person.entries, 300):
        values = ',\n'.join('(' + ', '.join(q(row[c]) for c in ENTRY_COLS) + ')' for row in chunk)
        parts.append(f"insert into time_entries ({', '.join(ENTRY_COLS)}) values\n{values};\n")
    for chunk in chunks(person.absences, 300):
        values = ',\n'.join('(' + ', '.join(q(row[c]) for c in ABSENCE_COLS) + ')' for row in chunk)
        parts.append(f"insert into absences ({', '.join(ABSENCE_COLS)}) values\n{values};\n")
    for chunk in chunks(person.audit, 300):
        values = ',\n'.join(
            f"({q(t)}, {q(r)}, {q(e)}, {q(o)}, {q(op)}, {jq(old)}, {jq(new)}, {q(by)}, {q(at)})"
            for t, r, e, o, op, old, new, by, at in chunk)
        parts.append("insert into audit_log (table_name, record_id, employee_id, organization_id, operation, old_data, new_data, changed_by, changed_at) values\n"
                     f"{values};\n")
    parts.append(TAIL)
    (OUT / f'{number:02d}_{person.id[:8]}.sql').write_text(''.join(parts), encoding='utf-8')
    summary.append((person.id[:8], len(person.entries), len(person.absences), len(person.audit)))

for row in summary:
    print(row)

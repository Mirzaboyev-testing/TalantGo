"""Competitions, teams and rankings (docs/13-musobaqalar.md, section 6 is the API contract): every rule, a full
two-stage team competition, an individual leaderboard, joining by code, captains, the persistent-team limit, test
statistics, the admin's hide and home switch, and the public highlights."""
from datetime import UTC, datetime, timedelta

from fastapi.routing import APIRoute
from sqlalchemy import select, update

from app.api import competitions as comp_api
from app.core.db import SessionLocal
from app.models import CompanyTest, Competition, CompetitionStage, Team, TestAttempt, User
from app.services import admin_access
from tests.conftest import owner_headers as owner
from tests.test_career import make_employer, uni_id, upload_doc
from tests.test_ranking_and_admin import staff_account
from tests.test_signup_and_tests import approved_employer, full_student
from tests.test_university_panel import approved_staff

API = "/api/v1"
ORG = f"{API}/organizer/competitions"
ADMIN = f"{API}/admin/competitions"


def iso(dt: datetime) -> str:
    return dt.isoformat()


def body(**over) -> dict:
    """A published two-stage team competition: registration open, stage 1 open now, the final later."""
    t = datetime.now(UTC)
    out = {"title": "Data Cup 2026", "description": "Ma'lumotlar tahlili bo'yicha jamoaviy musobaqa", "prize": "Amaliyot",
           "mode": "team", "team_kind": "any", "team_min": 2, "team_max": 3, "audience": "all", "job_fields": [],
           "registration_ends_at": iso(t + timedelta(hours=2)),
           "stages": [{"title": "Saralash", "description": "Keys", "starts_at": iso(t - timedelta(hours=1)),
                       "ends_at": iso(t + timedelta(hours=3)), "advance_count": 1},
                      {"title": "Final", "description": "Taqdimot", "starts_at": iso(t + timedelta(hours=3)),
                       "ends_at": iso(t + timedelta(hours=5))}],
           "publish": True}
    out.update(over)
    return out


def one_stage(**over) -> dict:
    t = datetime.now(UTC)
    return body(stages=[{"title": "Ish", "description": "", "starts_at": iso(t - timedelta(hours=1)),
                         "ends_at": iso(t + timedelta(hours=3))}], **over)


async def student(client, make_user, name: str, uni: str = "TDIU", fields: list[str] | None = None) -> dict:
    u = await full_student(client, make_user, name)
    changes = {}
    if uni != "TDIU":
        changes["university_id"] = await uni_id(uni)
    if fields is not None:
        changes["job_fields"] = fields
    if changes:
        r = await client.patch(f"{API}/me", json=changes, headers=u["headers"])
        assert r.status_code == 200, r.text
    return u


async def create(client, headers, base: str = ORG, **over) -> dict:
    r = await client.post(base, json=body(**over), headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def make_team(client, who: dict, name: str, kind: str = "persistent", competition_id: int | None = None) -> dict:
    r = await client.post(f"{API}/teams", json={"name": name, "kind": kind, "competition_id": competition_id},
                          headers=who["headers"])
    assert r.status_code == 201, r.text
    return r.json()


async def join(client, who: dict, code: str):
    return await client.post(f"{API}/teams/join", json={"code": code}, headers=who["headers"])


async def register(client, who: dict, cid: int, team_id: int | None = None):
    return await client.post(f"{API}/competitions/{cid}/register", json={"team_id": team_id} if team_id else {},
                             headers=who["headers"])


async def submit(client, who: dict, cid: int, stage_id: int, **extra):
    payload = {"proof_url": "https://github.com/jamoa/ish", "note": "", "file_ids": [], **extra}
    return await client.post(f"{API}/competitions/{cid}/stages/{stage_id}/submit", json=payload, headers=who["headers"])


async def travel(cid: int, *stages: tuple[timedelta, timedelta], reg: timedelta | None = None) -> None:
    """Moves a competition's stage times (relative to now), as if time had passed."""
    t = datetime.now(UTC)
    async with SessionLocal() as s:
        rows = (await s.execute(select(CompetitionStage).where(CompetitionStage.competition_id == cid)
                                .order_by(CompetitionStage.position))).scalars().all()
        for st, (a, b) in zip(rows, stages):
            st.starts_at, st.ends_at = t + a, t + b
        values = {"starts_at": rows[0].starts_at, "ends_at": rows[-1].ends_at}
        if reg is not None:
            values["registration_ends_at"] = t + reg
        await s.execute(update(Competition).where(Competition.id == cid).values(**values))
        await s.commit()


async def bell(client, who: dict) -> list[dict]:
    return (await client.get(f"{API}/me/notifications", headers=who["headers"])).json()["items"]


async def points(user_id: int) -> int:
    async with SessionLocal() as s:
        return (await s.get(User, user_id)).points


H = timedelta(hours=1)
M = timedelta(minutes=1)


# --------------------------------------------------------------------------- the whole flow

async def test_two_stage_team_competition_from_registration_to_season_points(client, make_user):
    hr = await approved_employer(client, make_user)
    a = await student(client, make_user, "Aziza Karimova")
    b = await student(client, make_user, "Bobur Aliyev")
    c = await student(client, make_user, "Charos Nazarova")
    d = await student(client, make_user, "Doniyor Rasulov")
    e = await student(client, make_user, "Elyor Tursunov", uni="TATU")

    comp = await create(client, hr["headers"])
    cid = comp["id"]
    s1, s2 = comp["stages"][0]["id"], comp["stages"][1]["id"]
    assert comp["status"] == "published" and comp["phase"] == "running" and comp["organizer"]["kind"] == "company"
    assert [s["phase"] for s in comp["stages"]] == ["open", "upcoming"] and comp["place_points"] == [50, 30, 20]
    assert comp["to_score"] == 0 and comp["is_hidden"] is False
    assert any(n["kind"] == "competition_new" and n["link"] == f"/talaba/topshiriqlar/musobaqalar?id={cid}"
               for n in await bell(client, a))

    alpha = await make_team(client, a, "Alpha")
    assert alpha["is_captain"] and alpha["invite_code"] and len(alpha["invite_code"]) == 6
    assert alpha["invite_url"].endswith(f"/talaba/topshiriqlar/jamoa?kod={alpha['invite_code']}")
    assert (await join(client, b, alpha["invite_code"].lower())).status_code == 200
    joined = next(n for n in await bell(client, a) if n["kind"] == "team_joined")
    assert joined["params"] == {"name": "Bobur Aliyev", "team": "Alpha"}
    assert joined["link"] == f"/talaba/topshiriqlar/jamoa?id={alpha['id']}"
    beta = await make_team(client, c, "Beta", "one_time", cid)
    assert beta["size_max"] == 3 and beta["competition_title"] == "Data Cup 2026"
    assert (await join(client, e, beta["invite_code"])).status_code == 200          # teams mix universities

    assert (await register(client, d, cid)).status_code == 422                       # a team competition needs a team
    assert (await register(client, b, cid, alpha["id"])).status_code == 403          # only the captain registers
    r = await register(client, a, cid, alpha["id"])
    assert r.status_code == 200, r.text
    assert r.json()["my_entry"]["team"]["name"] == "Alpha" and r.json()["entries_n"] == 1
    assert (await register(client, c, cid, beta["id"])).status_code == 200
    assert (await register(client, a, cid, alpha["id"])).status_code == 409          # once

    # stage 1: any member sends, the last one before the deadline counts; the organizer's notices collapse
    assert (await submit(client, b, cid, s1)).status_code == 200
    f = await upload_doc(client, e["headers"], "hisobot.xlsx", b"PK\x03\x04 test")
    r = await submit(client, e, cid, s1, proof_url="", file_ids=[f])
    assert r.status_code == 200, r.text
    assert r.json()["submissions"][0]["files"][0]["name"] == "hisobot.xlsx"
    hr_bell = [n for n in await bell(client, hr) if n["kind"] == "competition_submission"]
    assert len(hr_bell) == 1 and hr_bell[0]["params"]["count"] == 2 and hr_bell[0]["link"] == f"/korxona/musobaqalar?c={cid}"
    r = await submit(client, a, cid, s1, note="Yangilangan")
    assert r.json()["submissions"][0]["submitted_by"] == "Aziza Karimova" and len(r.json()["submissions"]) == 1

    rows = (await client.get(f"{ORG}/{cid}/entries", params={"stage_id": s1}, headers=hr["headers"])).json()
    assert {x["name"] for x in rows} == {"Alpha", "Beta"} and all(x["submission"] for x in rows)
    by = {x["name"]: x for x in rows}
    assert (await client.get(ORG, headers=hr["headers"])).json()[0]["to_score"] == 2
    r = await client.post(f"{ORG}/{cid}/stages/{s1}/score", json={"entry_id": by["Alpha"]["entry_id"], "score": 90,
                                                                  "comment": "Zo'r"}, headers=hr["headers"])
    assert r.status_code == 200 and r.json()["submission"]["score"] == 90 and r.json()["total_score"] == 90
    assert (await client.post(f"{ORG}/{cid}/stages/{s1}/score", json={"entry_id": by["Beta"]["entry_id"], "score": 70},
                              headers=hr["headers"])).status_code == 200
    assert (await client.post(f"{ORG}/{cid}/stages/{s1}/score", json={"entry_id": by["Beta"]["entry_id"], "score": 101},
                              headers=hr["headers"])).status_code == 422
    scored = next(n for n in await bell(client, b) if n["kind"] == "competition_scored")
    assert scored["params"]["score"] == 90 and scored["params"]["stage"] == "Saralash"

    board = (await client.get(f"{API}/competitions/{cid}/leaderboard", headers=e["headers"])).json()
    assert [x["name"] for x in board["rows"]] == ["Alpha", "Beta"] and board["my_rank"] == 2
    assert board["rows"][1]["is_me"] and board["rows"][0]["percent"] == 90 and board["average_percent"] == 80.0
    assert board["rows"][1]["subtitle"] == "2 kishi · TATU, TDIU" and board["stage_id"] == s1

    assert (await client.post(f"{ORG}/{cid}/stages/{s1}/close", json={}, headers=hr["headers"])).status_code == 409
    await travel(cid, (-3 * H, -M), (-M / 2, 2 * H), reg=-2 * H)
    assert (await client.post(f"{ORG}/{cid}/stages/{s2}/close", json={}, headers=hr["headers"])).status_code == 409
    r = await client.post(f"{ORG}/{cid}/stages/{s1}/close", json={}, headers=hr["headers"])
    assert r.status_code == 200, r.text
    assert [s["phase"] for s in r.json()["stages"]] == ["closed", "open"]
    assert any(n["kind"] == "stage_advanced" and n["params"]["next_stage"] == "Final" for n in await bell(client, a))
    assert any(n["kind"] == "stage_eliminated" for n in await bell(client, e))
    assert (await submit(client, c, cid, s2)).status_code == 409                       # Beta is out
    assert (await client.post(f"{ORG}/{cid}/stages/{s1}/score", json={"entry_id": by["Alpha"]["entry_id"], "score": 10},
                              headers=hr["headers"])).status_code == 409               # closed stage

    # a teammate is replaced while the competition runs: the stage-2 work records who was on the team
    assert (await client.delete(f"{API}/teams/{alpha['id']}/members/{b['id']}", headers=a["headers"])).status_code == 200
    assert any(n["kind"] == "team_removed" and n["params"] == {"team": "Alpha"} for n in await bell(client, b))
    assert (await join(client, d, alpha["invite_code"])).status_code == 200
    assert (await submit(client, d, cid, s2)).status_code == 200
    r = await client.post(f"{ORG}/{cid}/stages/{s2}/score", json={"entry_id": by["Alpha"]["entry_id"], "score": 80},
                          headers=hr["headers"])
    assert r.json()["total_score"] == 170 and [m["name"] for m in r.json()["members"]] == ["Aziza Karimova", "Doniyor Rasulov"]

    assert (await client.post(f"{ORG}/{cid}/results", headers=hr["headers"])).status_code == 409   # final still open
    await travel(cid, (-5 * H, -3 * H), (-2 * H, -M))
    r = await client.post(f"{ORG}/{cid}/results", headers=hr["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "results" and r.json()["phase"] == "finished"
    assert (await client.post(f"{ORG}/{cid}/results", headers=hr["headers"])).status_code == 409

    # 50 to everyone on Alpha's last work (not Bobur, who left), 30 to each of Beta; season points for Alpha only
    assert [await points(x["id"]) for x in (a, d, b, c, e)] == [50, 50, 0, 30, 30]
    async with SessionLocal() as s:
        alpha_row, beta_row = await s.get(Team, alpha["id"]), await s.get(Team, beta["id"])
        assert (alpha_row.points, alpha_row.wins, beta_row.points, beta_row.wins) == (50, 1, 0, 0)
    won = next(n for n in await bell(client, d) if n["kind"] == "competition_results")
    assert won["params"] == {"competition": "Data Cup 2026", "place": 1, "points": 50}

    board = (await client.get(f"{API}/competitions/{cid}/leaderboard", headers=a["headers"])).json()
    assert [(x["name"], x["place"], x["rank"]) for x in board["rows"]] == [("Alpha", 1, 1), ("Beta", 2, 2)]
    assert board["my_rank"] == 1 and board["rows"][0]["status"] == "finished" and board["rows"][1]["status"] == "eliminated"
    ranking = (await client.get(f"{API}/teams/ranking", headers=a["headers"])).json()
    assert ranking[0] | {"universities": ranking[0]["universities"]} == {
        "rank": 1, "team_id": alpha["id"], "name": "Alpha", "members_n": 2, "points": 50, "competitions_n": 1, "wins": 1,
        "universities": ["TDIU"]}
    detail = (await client.get(f"{API}/teams/{alpha['id']}", headers=b["headers"])).json()
    assert detail["history"] == [{"competition_id": cid, "title": "Data Cup 2026", "place": 1, "score": 170}]
    assert detail["invite_code"] is None and detail["mine"] is False                 # Bobur left: no code

    finished = (await client.get(f"{API}/competitions", params={"scope": "finished"}, headers=a["headers"])).json()
    assert [x["id"] for x in finished] == [cid] and finished[0]["my_entry"]["place"] == 1
    # Bobur worked on stage 1: the competition stays in his «mine» with the team's result
    mine = (await client.get(f"{API}/competitions", params={"scope": "mine"}, headers=b["headers"])).json()
    assert [x["id"] for x in mine] == [cid] and mine[0]["my_entry"]["place"] == 1


async def test_individual_competition_live_leaderboard_and_place_points(client, make_user):
    staff = await approved_staff(client, make_user, "TDIU")
    s1 = await student(client, make_user, "Sardor Ismoilov")
    s2 = await student(client, make_user, "Shahnoza Qodirova")
    s3 = await student(client, make_user, "Sevara Mirzayeva")
    other = await student(client, make_user, "Otabek Yusupov", uni="TATU")
    tatu = await uni_id("TATU")
    r = await client.post(ORG, json=one_stage(mode="individual", audience="university", university_id=tatu),
                          headers=staff["headers"])
    assert r.status_code == 403                                                       # only its own students
    comp = await create(client, staff["headers"], **one_stage(mode="individual", audience="university", team_min=3))
    cid, stage = comp["id"], comp["stages"][0]["id"]
    assert comp["team_min"] == comp["team_max"] == 1 and comp["organizer"] == {
        "kind": "university", "id": await uni_id("TDIU"), "name": "TDIU", "logo_url": None}
    assert comp["university_id"] == await uni_id("TDIU")

    assert (await client.get(f"{API}/competitions/{cid}", headers=other["headers"])).status_code == 404
    assert cid not in [x["id"] for x in (await client.get(f"{API}/competitions", headers=other["headers"])).json()]
    assert (await register(client, other, cid)).status_code == 404
    seen = (await client.get(f"{API}/competitions/{cid}", headers=s1["headers"])).json()
    assert seen["can_register"] is True and seen["why_not"] is None
    for who in (s1, s2, s3):
        r = await register(client, who, cid)
        assert r.status_code == 200, r.text
    assert r.json()["can_register"] is False and r.json()["my_entry"]["status"] == "registered"
    assert (await register(client, s1, cid)).status_code == 409
    assert (await client.post(f"{API}/competitions/{cid}/withdraw", headers=s1["headers"])).status_code == 409  # started

    for who in (s1, s2, s3):
        assert (await submit(client, who, cid, stage)).status_code == 200
    staff_bell = [n for n in await bell(client, staff) if n["kind"] == "competition_submission"]
    assert len(staff_bell) == 1 and staff_bell[0]["link"] == f"/universitet/musobaqalar?c={cid}"
    rows = {x["name"]: x["entry_id"] for x in (await client.get(f"{ORG}/{cid}/entries", headers=staff["headers"])).json()}
    for name, score in (("Sardor Ismoilov", 60), ("Shahnoza Qodirova", 90), ("Sevara Mirzayeva", 90)):
        r = await client.post(f"{ORG}/{cid}/stages/{stage}/score", json={"entry_id": rows[name], "score": score},
                              headers=staff["headers"])
        assert r.status_code == 200, r.text
    board = (await client.get(f"{API}/competitions/{cid}/leaderboard", headers=s1["headers"])).json()
    assert [(x["rank"], x["score"]) for x in board["rows"]] == [(1, 90), (1, 90), (3, 60)]          # a tie shares
    assert board["my_rank"] == 3 and board["my_percentile"] == 100 and board["average_percent"] == 80.0
    assert board["rows"][2]["subtitle"] == "TDIU · Iqtisodiyot · 2-kurs" and board["rows"][2]["is_me"]
    staged = (await client.get(f"{API}/competitions/{cid}/leaderboard", params={"stage_id": stage},
                               headers=s2["headers"])).json()
    assert staged["my_rank"] == 1 and staged["my_percentile"] == 33 and staged["stage_id"] == stage
    me = (await client.get(f"{API}/competitions/{cid}", headers=s1["headers"])).json()["my_entry"]
    assert me["rank"] == 3 and me["total_score"] == 60
    # everyone signed in sees the live leaderboard, the organizer side too
    assert (await client.get(f"{API}/competitions/{cid}/leaderboard", headers=staff["headers"])).status_code == 200

    await travel(cid, (-3 * H, -M))
    r = await client.post(f"{ORG}/{cid}/results", headers=staff["headers"])
    assert r.status_code == 200, r.text
    assert [await points(x["id"]) for x in (s2, s3, s1)] == [50, 50, 20]               # a tie for 1st: both 50, then 3rd


async def test_registration_rules(client, make_user):
    hr = await approved_employer(client, make_user)
    a = await student(client, make_user, "Akmal Hakimov")
    b = await student(client, make_user, "Barno Sobirova")
    c = await student(client, make_user, "Ziyoda Ergasheva")
    coder = await student(client, make_user, "Kamron Saidov", fields=["software"])

    # audience: overlapping job functions (the default students have finance and data)
    soft = await create(client, hr["headers"], **one_stage(mode="individual", audience="fields", job_fields=["software"]))
    assert (await client.get(f"{API}/competitions/{soft['id']}", headers=a["headers"])).status_code == 404
    assert (await register(client, coder, soft["id"])).status_code == 200
    assert (await client.post(ORG, json=one_stage(audience="fields", job_fields=[]), headers=hr["headers"])).status_code == 422
    assert (await client.post(ORG, json=one_stage(audience="fields", job_fields=["kosmos"]), headers=hr["headers"])).status_code == 422

    # a draft is not shown; publishing it notifies the audience
    draft = await create(client, hr["headers"], **one_stage(mode="individual", publish=False))
    assert draft["status"] == "draft" and draft["phase"] == "upcoming"
    assert (await client.get(f"{API}/competitions/{draft['id']}", headers=a["headers"])).status_code == 404
    assert not [n for n in await bell(client, a) if n["params"].get("competition") == draft["title"] and n["kind"] == "competition_new"
                and n["link"].endswith(f"={draft['id']}")]
    assert (await client.post(f"{ORG}/{draft['id']}/publish", headers=hr["headers"])).json()["status"] == "published"
    assert any(n["kind"] == "competition_new" and n["link"].endswith(f"={draft['id']}") for n in await bell(client, a))

    # withdrawing before the start and coming back; registration closes at its deadline
    t = datetime.now(UTC)
    later = await create(client, hr["headers"], mode="individual", stages=[
        {"title": "Ish", "description": "", "starts_at": iso(t + 3 * H), "ends_at": iso(t + 5 * H)}])
    assert later["phase"] == "registration"
    assert (await register(client, a, later["id"])).status_code == 200
    r = await client.post(f"{API}/competitions/{later['id']}/withdraw", headers=a["headers"])
    assert r.status_code == 200 and r.json()["my_entry"] is None and r.json()["can_register"] is True
    assert (await register(client, a, later["id"])).status_code == 200
    await travel(later["id"], (3 * H, 5 * H), reg=-M)
    assert (await register(client, b, later["id"])).status_code == 409
    why = (await client.get(f"{API}/competitions/{later['id']}", headers=b["headers"])).json()
    assert why["can_register"] is False and why["why_not"] == "Ro'yxatdan o'tish muddati tugagan"

    # team kind and size
    persistent_only = await create(client, hr["headers"], **one_stage(team_kind="persistent"))
    one_time_only = await create(client, hr["headers"], **one_stage(team_kind="one_time"))
    p = await make_team(client, a, "Doimiylar")
    assert (await join(client, b, p["invite_code"])).status_code == 200
    assert (await client.post(f"{API}/teams", json={"name": "Bir martalik", "kind": "one_time",
                                                    "competition_id": persistent_only["id"]},
                              headers=c["headers"])).status_code == 409
    assert (await register(client, a, one_time_only["id"], p["id"])).status_code == 409
    assert (await register(client, a, persistent_only["id"], p["id"])).status_code == 200
    o = await make_team(client, c, "Tezkor", "one_time", one_time_only["id"])
    assert (await register(client, c, one_time_only["id"], o["id"])).status_code == 409        # 1 of min 2
    other_any = await create(client, hr["headers"], **one_stage())
    assert (await register(client, c, other_any["id"], o["id"])).status_code == 409           # made for another one

    # nobody of the registering team may already be in another team of the same competition
    small = await create(client, hr["headers"], **one_stage(team_max=2))
    q = await make_team(client, c, "Uchinchi")
    assert (await join(client, b, q["invite_code"])).status_code == 200
    assert (await register(client, a, small["id"], p["id"])).status_code == 200
    r = await register(client, c, small["id"], q["id"])
    assert r.status_code == 409 and "Barno Sobirova" in r.json()["detail"]
    # and a team above the size limit cannot register
    big = await make_team(client, coder, "Katta")
    for name in ("Gulnoza Aminova", "Hasan Qosimov"):
        assert (await join(client, await student(client, make_user, name), big["invite_code"])).status_code == 200
    assert (await register(client, coder, small["id"], big["id"])).status_code == 409


async def test_join_by_code_captains_and_the_persistent_limit(client, make_user):
    hr = await approved_employer(client, make_user)
    a = await student(client, make_user, "Anvar Jo'rayev")
    b = await student(client, make_user, "Bekzod Komilov")
    c = await student(client, make_user, "Dilfuza Olimova")
    d = await student(client, make_user, "Feruza Sattorova")

    t1 = await make_team(client, a, "Birinchi")
    preview = (await client.get(f"{API}/teams/join/{t1['invite_code'].lower()}", headers=b["headers"])).json()
    assert preview == {"id": t1["id"], "name": "Birinchi", "kind": "persistent", "members_n": 1, "size_max": 5,
                       "competition_title": None, "captain_name": "Anvar Jo'rayev"}
    assert (await client.get(f"{API}/teams/join/0OI1AB", headers=b["headers"])).status_code == 404
    assert (await join(client, b, "ZZZZZZ")).status_code == 404
    assert (await join(client, b, t1["invite_code"])).status_code == 200
    assert (await join(client, b, t1["invite_code"])).status_code == 200                 # a second tap: already in
    seen = (await client.get(f"{API}/teams/{t1['id']}", headers=c["headers"])).json()
    assert seen["invite_code"] is None and [m["role"] for m in seen["members"]] == ["captain", "member"]

    # captain-only actions; a captain leaves only after handing over; renewing the code kills the old one
    assert (await client.delete(f"{API}/teams/{t1['id']}/members/{a['id']}", headers=b["headers"])).status_code == 403
    assert (await client.post(f"{API}/teams/{t1['id']}/code", headers=b["headers"])).status_code == 403
    assert (await client.patch(f"{API}/teams/{t1['id']}", json={"name": "X Y"}, headers=b["headers"])).status_code == 403
    assert (await client.post(f"{API}/teams/{t1['id']}/leave", headers=a["headers"])).status_code == 409
    old = t1["invite_code"]
    new = (await client.post(f"{API}/teams/{t1['id']}/code", headers=a["headers"])).json()["invite_code"]
    assert new != old and (await join(client, c, old)).status_code == 404
    r = await client.post(f"{API}/teams/{t1['id']}/captain", json={"user_id": b["id"]}, headers=a["headers"])
    assert r.status_code == 200 and r.json()["captain_id"] == b["id"] and r.json()["is_captain"] is False
    assert (await client.post(f"{API}/teams/{t1['id']}/leave", headers=a["headers"])).json() == {"ok": True}
    assert [t["id"] for t in (await client.get(f"{API}/teams/mine", headers=a["headers"])).json()] == []
    r = await client.patch(f"{API}/teams/{t1['id']}", json={"name": "  Yangi   nom ", "description": "Data"}, headers=b["headers"])
    assert r.json()["name"] == "Yangi nom" and r.json()["description"] == "Data"

    # a lone captain leaving archives the team (and its code)
    solo = await make_team(client, c, "Yolg'iz")
    assert (await client.post(f"{API}/teams/{solo['id']}/leave", headers=c["headers"])).status_code == 200
    assert (await join(client, d, solo["invite_code"])).status_code == 404

    # at most two persistent teams per student, created or joined
    await make_team(client, d, "Ikkinchi")
    await make_team(client, d, "Uchinchi")
    assert (await client.post(f"{API}/teams", json={"name": "To'rtinchi", "kind": "persistent"},
                              headers=d["headers"])).status_code == 409
    assert (await join(client, d, new)).status_code == 409

    # a full team; companies cannot make teams
    comp = await create(client, hr["headers"], **one_stage(team_max=2))
    pair = await make_team(client, a, "Juftlik", "one_time", comp["id"])
    assert (await join(client, c, pair["invite_code"])).status_code == 200
    r = await join(client, await student(client, make_user, "Gavhar Ruziyeva"), pair["invite_code"])
    assert r.status_code == 409 and "to'lgan" in r.json()["detail"]
    assert (await client.post(f"{API}/teams", json={"name": "Firma", "kind": "persistent"},
                              headers=hr["headers"])).status_code == 403
    # one team per competition: a second one-time team for the same competition is refused
    assert (await client.post(f"{API}/teams", json={"name": "Yana", "kind": "one_time", "competition_id": comp["id"]},
                              headers=c["headers"])).status_code == 409

    # joining a team entered in a running competition while already in another team there
    t2 = (await client.get(f"{API}/teams/mine", headers=d["headers"])).json()
    first, second = t2[0], t2[1]
    e = await student(client, make_user, "Islom Normatov")
    f = await student(client, make_user, "Jahongir Yo'ldoshev")
    assert (await join(client, e, first["invite_code"])).status_code == 200
    assert (await join(client, f, second["invite_code"])).status_code == 200
    any_comp = await create(client, hr["headers"], **one_stage())
    assert (await register(client, d, any_comp["id"], first["id"])).status_code == 200
    r = await register(client, d, any_comp["id"], second["id"])
    assert r.status_code == 409 and "Feruza Sattorova" in r.json()["detail"]             # one team per competition
    g = await student(client, make_user, "Kamola Xasanova")
    third = await make_team(client, g, "Boshqa", "one_time", any_comp["id"])
    assert (await join(client, f, third["invite_code"])).status_code == 200
    assert (await register(client, g, any_comp["id"], third["id"])).status_code == 200
    r = await join(client, f, first["invite_code"])
    assert r.status_code == 409 and "boshqa jamoa" in r.json()["detail"]


async def test_submission_rules_and_team_size_at_submission(client, make_user):
    hr = await approved_employer(client, make_user)
    a = await student(client, make_user, "Laylo Tojiyeva")
    b = await student(client, make_user, "Mansur Ortiqov")
    outsider = await student(client, make_user, "Nodira Valiyeva")
    comp = await create(client, hr["headers"])
    cid, s1, s2 = comp["id"], comp["stages"][0]["id"], comp["stages"][1]["id"]
    team = await make_team(client, a, "Sinov")
    await join(client, b, team["invite_code"])
    assert (await register(client, a, cid, team["id"])).status_code == 200

    assert (await submit(client, outsider, cid, s1)).status_code == 404                # not registered
    assert (await submit(client, a, cid, s2)).status_code == 409                       # the final is not open yet
    assert (await submit(client, a, cid, s1, proof_url="")).status_code == 422          # a link or a file
    assert (await submit(client, a, cid, s1, proof_url="javascript:alert(1)")).status_code == 422
    other = await upload_doc(client, b["headers"], "boshqa.pdf")
    assert (await submit(client, a, cid, s1, file_ids=[other])).status_code == 422      # not her file

    # the team drops below the minimum: work is refused until a teammate joins
    assert (await client.delete(f"{API}/teams/{team['id']}/members/{b['id']}", headers=a["headers"])).status_code == 200
    r = await submit(client, a, cid, s1)
    assert r.status_code == 409 and "2–3" in r.json()["detail"]
    assert (await join(client, outsider, team["invite_code"])).status_code == 200
    assert (await submit(client, a, cid, s1)).status_code == 200

    # stage 1 closes with nobody scored and advance_count 1: nobody advances, the team is eliminated
    await travel(cid, (-3 * H, -M), (-M / 2, 2 * H), reg=-2 * H)
    r = await client.post(f"{ORG}/{cid}/stages/{s1}/close", json={}, headers=hr["headers"])
    assert r.status_code == 200
    assert (await submit(client, a, cid, s2)).status_code == 409


async def test_close_with_an_explicit_list_and_stage_order(client, make_user):
    hr = await approved_employer(client, make_user)
    t = datetime.now(UTC)
    stages = [{"title": f"B{i}", "description": "", "starts_at": iso(t + (i - 1) * 2 * H - H),
               "ends_at": iso(t + i * 2 * H - H), "advance_count": 5} for i in (1, 2, 3)]
    comp = await create(client, hr["headers"], mode="individual", registration_ends_at=iso(t + 30 * M), stages=stages)
    cid = comp["id"]
    ids = [s["id"] for s in comp["stages"]]
    people = [await student(client, make_user, n) for n in ("Olim Tursunov", "Parizod Xolmatova", "Rustam Ahmedov")]
    for p in people:
        await register(client, p, cid)
        await submit(client, p, cid, ids[0])
    await travel(cid, (-5 * H, -4 * H), (-3 * H, -2 * H), (-H, H))
    assert (await client.post(f"{ORG}/{cid}/stages/{ids[1]}/close", json={}, headers=hr["headers"])).status_code == 409
    entries = (await client.get(f"{ORG}/{cid}/entries", params={"stage_id": ids[0]}, headers=hr["headers"])).json()
    keep = [x["entry_id"] for x in entries if x["name"] != "Rustam Ahmedov"]
    assert (await client.post(f"{ORG}/{cid}/stages/{ids[0]}/close", json={"advance_entry_ids": [999999]},
                              headers=hr["headers"])).status_code == 422
    r = await client.post(f"{ORG}/{cid}/stages/{ids[0]}/close", json={"advance_entry_ids": keep}, headers=hr["headers"])
    assert r.status_code == 200
    board = (await client.get(f"{API}/competitions/{cid}/leaderboard", headers=people[2]["headers"])).json()
    assert [x["stage_reached"] for x in board["rows"]] == [2, 2, 1] and board["rows"][2]["status"] == "eliminated"
    # stage 2 ended without anyone sending work: closing it (no list, no scores) eliminates everyone left
    assert (await client.post(f"{ORG}/{cid}/stages/{ids[1]}/close", json={}, headers=hr["headers"])).status_code == 200
    statuses = {x["name"]: x["status"] for x in (await client.get(f"{ORG}/{cid}/entries", headers=hr["headers"])).json()}
    assert set(statuses.values()) == {"eliminated"}


# --------------------------------------------------------------------------- organizers

async def test_organizer_access_and_edit_rules(client, make_user):
    hr = await approved_employer(client, make_user)
    other_hr = await approved_employer(client, make_user, "HR Boshqa", "309876543")
    pending = await make_employer(client, make_user, "HR Kutilmoqda", "305555555")
    st = await student(client, make_user, "Sanjar Rahimov")
    assert (await client.post(ORG, json=body(), headers=pending["headers"])).status_code == 403
    assert (await client.get(ORG, headers=st["headers"])).status_code == 403

    t = datetime.now(UTC)
    later = [{"title": "Bir", "description": "", "starts_at": iso(t + 3 * H), "ends_at": iso(t + 5 * H)}]
    comp = await create(client, hr["headers"], stages=later, publish=False)
    cid = comp["id"]
    assert (await client.patch(f"{ORG}/{cid}", json={"title": "Begona"}, headers=other_hr["headers"])).status_code == 404
    assert cid not in [x["id"] for x in (await client.get(ORG, headers=other_hr["headers"])).json()]

    # before the start everything changes, stages included
    two = later + [{"title": "Ikki", "description": "Final", "starts_at": iso(t + 6 * H), "ends_at": iso(t + 8 * H)}]
    r = await client.patch(f"{ORG}/{cid}", json={"team_max": 4, "stages": two, "place_points": [100, 50]},
                           headers=hr["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["team_max"] == 4 and [s["title"] for s in r.json()["stages"]] == ["Bir", "Ikki"]
    assert r.json()["place_points"] == [100, 50] and r.json()["ends_at"].startswith(iso(t + 8 * H)[:16])
    bad = [{**two[1]}, {**two[0]}]                                                    # out of order
    assert (await client.patch(f"{ORG}/{cid}", json={"stages": bad}, headers=hr["headers"])).status_code == 422
    assert (await client.patch(f"{ORG}/{cid}", json={"place_points": [500]}, headers=hr["headers"])).status_code == 422
    r = await client.patch(f"{ORG}/{cid}", json={"stages": later}, headers=hr["headers"])
    assert [s["title"] for s in r.json()["stages"]] == ["Bir"]

    # once it started only the texts change (the whole form sent back unchanged is fine)
    assert (await client.post(f"{ORG}/{cid}/publish", headers=hr["headers"])).status_code == 200
    await travel(cid, (-H, 2 * H), reg=-M)
    assert (await client.patch(f"{ORG}/{cid}", json={"team_max": 3}, headers=hr["headers"])).status_code == 409
    full = {k: v for k, v in r.json().items() if k in ("title", "mode", "team_kind", "team_min", "team_max", "audience",
                                                     "job_fields", "place_points")}
    r = await client.patch(f"{ORG}/{cid}", json={**full, "title": "Yangi nom", "prize": "Noutbuk"}, headers=hr["headers"])
    assert r.status_code == 200, r.text
    assert r.json()["title"] == "Yangi nom" and r.json()["prize"] == "Noutbuk"

    r = await client.post(f"{ORG}/{cid}/archive", headers=hr["headers"])
    assert r.json()["status"] == "archived"
    assert (await client.get(f"{API}/competitions/{cid}", headers=st["headers"])).status_code == 404
    assert (await client.patch(f"{ORG}/{cid}", json={"title": "Qayta"}, headers=hr["headers"])).status_code == 409


async def test_admin_hide_home_switch_and_public_highlights(client, make_user):
    admin = await owner(client)
    a = await student(client, make_user, "Ulug'bek Sharipov")
    b = await student(client, make_user, "Vazira Hamidova")
    comp = await create(client, admin, base=ADMIN, **one_stage(mode="individual"))
    cid = comp["id"]
    assert comp["organizer"] == {"kind": "platform", "id": None, "name": "Careerup", "logo_url": None}
    assert [x["id"] for x in (await client.get(ADMIN, headers=admin)).json()] == [cid]

    r = await client.post(f"{ADMIN}/{cid}/hide", headers=admin)
    assert r.status_code == 200 and r.json()["is_hidden"] is True
    assert (await client.get(f"{API}/competitions/{cid}", headers=a["headers"])).status_code == 404
    assert (await client.post(f"{ADMIN}/{cid}/restore", headers=admin)).json()["is_hidden"] is False
    for who in (a, b):
        await register(client, who, cid)
        await submit(client, who, cid, comp["stages"][0]["id"])
    rows = {x["name"]: x["entry_id"] for x in (await client.get(f"{ADMIN}/{cid}/entries", headers=admin)).json()}
    await client.post(f"{ADMIN}/{cid}/stages/{comp['stages'][0]['id']}/score",
                      json={"entry_id": rows["Vazira Hamidova"], "score": 95}, headers=admin)
    await travel(cid, (-3 * H, -M))
    assert (await client.post(f"{ADMIN}/{cid}/results", headers=admin)).status_code == 200
    team = await make_team(client, a, "Yulduzlar")

    # the home block is off until an admin switches it on
    assert (await client.get(f"{ADMIN}/home", headers=admin)).json() == {"show": False}
    assert (await client.get(f"{API}/public/competitions/highlights")).json() == {"show": False, "winners": [], "teams": []}
    assert (await client.put(f"{ADMIN}/home", json={"show": True}, headers=admin)).json() == {"show": True}
    shown = (await client.get(f"{API}/public/competitions/highlights")).json()
    assert shown["show"] is True and shown["teams"][0]["team_id"] == team["id"]
    assert shown["winners"][0] == {"competition_id": cid, "title": "Data Cup 2026", "organizer": "Careerup", "place": 1,
                                   "name": "Vazira Hamidova", "kind": "student"}
    # hidden competitions leave the public block
    await client.post(f"{ADMIN}/{cid}/hide", headers=admin)
    assert (await client.get(f"{API}/public/competitions/highlights")).json()["winners"] == []

    # limited admin accounts: the «tests» permission decides, reads included
    mod = await staff_account(client, "moderator", "mod@careerup.test")
    analyst = await staff_account(client, "analyst", "analyst@careerup.test")
    assert (await client.get(ADMIN, headers=mod)).status_code == 200
    assert (await client.post(f"{ADMIN}/{cid}/restore", headers=mod)).status_code == 200
    assert (await client.get(ADMIN, headers=analyst)).status_code == 403
    assert (await client.get(f"{ADMIN}/{cid}/entries", headers=analyst)).status_code == 403
    assert (await client.put(f"{ADMIN}/home", json={"show": False}, headers=analyst)).status_code == 403


def test_every_admin_competition_route_needs_the_tests_permission():
    routes = [r for r in comp_api.admin_router.routes if isinstance(r, APIRoute)]
    assert len(routes) >= 13
    for route in routes:
        for method in route.methods - {"HEAD"}:
            assert admin_access.required(method, route.path) == "tests", (method, route.path)


# --------------------------------------------------------------------------- test statistics

async def test_test_stats_are_anonymous_and_only_for_a_graded_attempt(client, make_user):
    hr = await approved_employer(client, make_user)
    me = await student(client, make_user, "Xurshida Abdullayeva")
    async with SessionLocal() as s:
        test = CompanyTest(company_id=hr["company_id"], title="Excel testi", status="approved")
        survey = CompanyTest(company_id=hr["company_id"], title="So'rovnoma", status="approved")
        s.add_all([test, survey])
        await s.flush()
        others = [User(full_name=f"Talaba {i}", account_type="student") for i in range(5)]
        s.add_all(others)
        await s.flush()
        for u, score in zip(others, (10, 9, 5, 2, 0)):
            s.add(TestAttempt(test_id=test.id, user_id=u.id, status="graded", score=score, max_score=10))
        s.add(TestAttempt(test_id=test.id, user_id=me["id"], status="graded", score=7.5, max_score=10))
        s.add(TestAttempt(test_id=survey.id, user_id=me["id"], status="graded", score=0, max_score=0))
        late = User(full_name="Kutayotgan", account_type="student")
        s.add(late)
        await s.flush()
        s.add(TestAttempt(test_id=test.id, user_id=late.id, status="submitted", score=3, max_score=10))
        await s.commit()
        test_id, survey_id, late_id = test.id, survey.id, late.id
    r = await client.get(f"{API}/tests/{test_id}/stats", headers=me["headers"])
    assert r.status_code == 200, r.text
    assert r.json() == {"my_score": 7.5, "max_score": 10, "percent": 75.0, "rank": 3, "of": 6, "percentile": 50,
                        "average_percent": 55.8, "best_percent": 100.0,
                        "distribution": [1, 0, 1, 0, 0, 1, 0, 1, 0, 2]}
    assert (await client.get(f"{API}/tests/{survey_id}/stats", headers=me["headers"])).status_code == 404
    stranger = await student(client, make_user, "Yorqin Zokirov")
    assert (await client.get(f"{API}/tests/{test_id}/stats", headers=stranger["headers"])).status_code == 404
    assert late_id

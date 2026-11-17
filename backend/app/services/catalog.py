"""Fixed choice lists used by sign-up forms, filters and validation. One source for the server and the app
(the app reads them from GET /catalog), so a value saved today is still understood tomorrow."""

# Business fields. Companies pick one; students pick the fields they want to work in, so the two match.
INDUSTRIES: dict[str, str] = {
    "it": "IT / dasturlash",
    "fintech": "Fintex",
    "bank": "Bank",
    "insurance": "Sug'urta",
    "telecom": "Telekom",
    "ecommerce": "Savdo / e-commerce",
    "logistics": "Logistika",
    "manufacturing": "Ishlab chiqarish",
    "construction": "Qurilish",
    "education": "Ta'lim / EdTech",
    "health": "Tibbiyot",
    "consulting": "Konsalting / audit",
    "marketing": "Marketing / reklama",
    "government": "Davlat sektori",
    "other": "Boshqa",
}

# Job functions ("kasb yo'nalishlari", 2026-11-17): what work a student can do, whatever the business field.
# Students pick 1-5 at sign-up; a vacancy names 1-3, and matching compares the two.
JOB_FIELDS: dict[str, str] = {
    "software": "Dasturlash",
    "data": "Data tahlil va sun'iy intellekt",
    "it_support": "IT qo'llab-quvvatlash va tarmoq",
    "design": "Dizayn (UI/UX, grafik)",
    "marketing": "Marketing va SMM",
    "content": "Kontent, jurnalistika va media",
    "sales": "Sotuv",
    "support": "Mijozlarga xizmat ko'rsatish",
    "finance": "Moliya va buxgalteriya",
    "economics": "Iqtisodiy tahlil va tadqiqot",
    "management": "Menejment va loyiha boshqaruvi",
    "hr": "HR va kadrlar",
    "admin": "Ofis va administratsiya",
    "law": "Huquq",
    "education": "O'qitish va repetitorlik",
    "translation": "Tarjima va tillar",
    "logistics": "Logistika va ta'minot",
    "engineering": "Muhandislik va texnika",
    "architecture": "Arxitektura va qurilish",
    "medicine": "Tibbiyot va farmatsevtika",
    "tourism": "Turizm va mehmondo'stlik",
    "agro": "Qishloq xo'jaligi",
    "other": "Boshqa",
}

LEGAL_FORMS: dict[str, str] = {
    "llc": "MChJ",
    "jsc": "AJ",
    "sole": "YaTT",
    "other": "Boshqa",
    # older sign-ups mixed the legal form with the kind of company; still valid, no longer offered
    "state": "Davlat korxonasi",
    "foreign": "Xorijiy kompaniya",
    "startup": "Startap",
    "ngo": "NNT",
}
LEGACY_LEGAL_FORMS = ("state", "foreign", "startup", "ngo")

# What kind of company it is (asked apart from the legal form since 2026-11-17).
OWNERSHIP: dict[str, str] = {
    "private": "Xususiy",
    "state": "Davlat",
    "foreign": "Xorijiy yoki qo'shma",
    "startup": "Startap",
    "ngo": "Notijorat",
}

# Who fills in the form: a director signs for the company; anyone else needs a letter of authority.
CONTACT_ROLES: dict[str, str] = {
    "director": "Direktor / ta'sischi",
    "representative": "Vakil (xodim)",
}

# What the company wants to do with students.
COOPERATION: dict[str, str] = {
    "internship": "Stajirovka",
    "part_time": "Yarim stavka yoki masofaviy ish",
    "junior": "To'liq stavkali junior ish",
    "projects": "Real loyihalar",
    "tests": "Namunaviy test",
    "hackathon": "Hakaton",
    "dual": "Dual ta'lim",
}

COMPANY_SIZES: dict[str, str] = {
    "1-10": "1–10 xodim",
    "11-50": "11–50 xodim",
    "51-200": "51–200 xodim",
    "201-1000": "201–1000 xodim",
    "1000+": "1000+ xodim",
}

REGIONS: list[str] = [
    "Toshkent shahri", "Toshkent viloyati", "Andijon", "Buxoro", "Farg'ona", "Jizzax", "Xorazm", "Namangan",
    "Navoiy", "Qashqadaryo", "Qoraqalpog'iston", "Samarqand", "Sirdaryo", "Surxondaryo",
]

# Bumped when the consent text changes in a way that needs a fresh "yes" (v2: approved employers see
# every student's name, study details, results and CV).
CONSENT_VERSION = 2


def industry_label(key: str) -> str:
    return INDUSTRIES.get(key, key)


def as_dict() -> dict:
    return {"industries": INDUSTRIES, "job_fields": JOB_FIELDS,
            "legal_forms": {k: v for k, v in LEGAL_FORMS.items() if k not in LEGACY_LEGAL_FORMS},
            "legal_forms_all": LEGAL_FORMS, "company_sizes": COMPANY_SIZES, "regions": REGIONS,
            "ownership": OWNERSHIP, "contact_roles": CONTACT_ROLES, "cooperation": COOPERATION}


def clean_faculties(names: list[str]) -> list[str]:
    """A university's faculty list as typed by staff or an admin: trimmed, no repeats (any case), 2-120 chars."""
    out: list[str] = []
    seen: set[str] = set()
    for name in names:
        name = " ".join(name.split())[:120]
        if len(name) >= 2 and name.lower() not in seen:
            seen.add(name.lower())
            out.append(name)
    return out[:60]

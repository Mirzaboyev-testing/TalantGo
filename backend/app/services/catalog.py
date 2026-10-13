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

LEGAL_FORMS: dict[str, str] = {
    "llc": "MChJ",
    "jsc": "AJ",
    "sole": "YaTT",
    "state": "Davlat korxonasi",
    "foreign": "Xorijiy kompaniya",
    "startup": "Startap",
    "ngo": "NNT",
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
    return {"industries": INDUSTRIES, "legal_forms": LEGAL_FORMS, "company_sizes": COMPANY_SIZES, "regions": REGIONS}

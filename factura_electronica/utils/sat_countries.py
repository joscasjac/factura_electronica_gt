# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
"""Country names as SAT's export complement expects them.

cex:PaisConsignatario (GT_Complemento_Exportaciones-0.1.0) is an enumeration of
Spanish country names ("Estados Unidos", "México"), not ISO codes.
data/sat_export_countries.json maps ISO 3166 alpha-2 -> SAT name for all 250
values in the schema.
"""

from __future__ import unicode_literals

import functools
import json
import os

_DATA = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "sat_export_countries.json")


@functools.lru_cache(maxsize=None)
def _table():
    with open(_DATA, encoding="utf-8") as handle:
        return json.load(handle)


def sat_country_name(iso_code):
    """SAT name for an ISO alpha-2 code, or None when SAT has no entry."""
    if not iso_code:
        return None
    return _table().get(str(iso_code).strip().upper())

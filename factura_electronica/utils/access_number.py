# -*- coding: utf-8 -*-
# Copyright (c) 2026, QuestFlows and contributors
"""NumeroAcceso for FEL DatosGenerales.

SAT's schema (GT_Documento-0.2.1) requires 100000000 <= NumeroAcceso <= 999999999.
Access Number FCAM records are named FCAM-000000001, FCAM-000000002, ... so the
sequence is offset by 100000000, which keeps it unique and inside SAT's range.
"""

from __future__ import unicode_literals

SAT_MIN = 100000000
SAT_MAX = 999999999


def fel_access_number(access_number_name):
    if not access_number_name:
        return None
    sequence = int(str(access_number_name).rsplit("-", 1)[-1])
    value = sequence if sequence >= SAT_MIN else SAT_MIN + sequence
    if value > SAT_MAX:
        raise ValueError("NumeroAcceso {0} exceeds SAT's maximum {1}".format(value, SAT_MAX))
    return str(value)

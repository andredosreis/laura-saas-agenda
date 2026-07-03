"""_BOOKING_REGEX só deve disparar em CONFIRMAÇÕES, não em propostas.

Fix: as raízes `marc|agend|confirm` apanhavam infinitivos e perguntas
("Podemos marcar às 15:00?") e promoviam o lead a 'agendado' no Kanban
sem marcação real. Passam a exigir particípio (marcado/agendada/confirmado).
"""

from ia_service.services.lead_orchestrator import _BOOKING_REGEX


def test_participle_confirmation_with_time_matches():
    assert _BOOKING_REGEX.search("Está marcado, Cintia! 🎉 Quarta dia 13 às 09:00")


def test_confirmada_matches():
    assert _BOOKING_REGEX.search("A sua avaliação fica confirmada para as 15:00")


def test_agendado_with_h_suffix_matches():
    assert _BOOKING_REGEX.search("Agendado para sexta às 14h")


def test_proposal_question_does_not_match():
    assert not _BOOKING_REGEX.search("Podemos marcar às 15:00?")


def test_infinitive_offer_does_not_match():
    assert not _BOOKING_REGEX.search("Quer marcar para as 09:00, 11:00 ou 14:00")


def test_confirmation_verb_question_does_not_match():
    assert not _BOOKING_REGEX.search("Posso confirmar a sua avaliação para as 10:00?")

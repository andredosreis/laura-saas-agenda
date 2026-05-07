"""Lead agent — Phase 4 stub.

Phase 4 will implement a LangGraph StateGraph agent here:
  - Intent classifier (gpt-4o-mini)
  - Branch per intent: duvida_servico, pergunta_preco, pedir_agendamento, desistencia, outra
  - Tools: find_servico, find_faq, update_lead_status, move_lead_stage, qualify_lead,
           get_available_slots, schedule_appointment
  - Timeout: 20s total

For now, lead_orchestrator.py uses a time-based greeting directly.
"""

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { dispatch } from "../services/functionDispatcher.js";

export const createClientTool = tool(
  async (args) => {
    try {
      const result = await dispatch('create_client', args);
      return JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
  {
    name: "create_client",
    description: "Cria cliente existente no banco de dados",
    schema: z.object({
      name: z.string(),
      phone: z.string(),
      birthDate: z.string().optional()
    })
  }
);

export const updateClientDataTool = tool(
  async (args) => {
    try {
      const result = await dispatch('update_client_data', args);
      return JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
  {
    name: "update_client_data",
    description: "Atualiza os dados de um cliente",
    schema: z.object({
      clientId: z.string(),
      name: z.string(),
      phone: z.string(),
      dateOfBirth: z.string()
    })
  }
);

export const scheduleAppointmentTool = tool(
  async (args) => {
    try {
      const result = await dispatch('schedule_appointment', args);
      return JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
  {
    name: "schedule_appointment",
    description: "Marca uma sessão para o cliente num horário específico",
    schema: z.object({
      clientId: z.string(),
      datetime: z.string()
    })
  }
);

export const updateAppointmentTool = tool(
  async (args) => {
    try {
      const result = await dispatch('update_appointment', args);
      return JSON.stringify(result);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
  {
    name: "update_appointment",
    description: "Reagenda ou cancela um agendamento existente",
    schema: z.object({
      appointmentId: z.string(),
      action: z.enum(["reschedule", "cancel"]),
      newDateTime: z.string().optional()
    })
  }
);

export const getAvailableSlotsTool = tool(
  async () => {
    try {
      // Mock logic as it was in the original controller, or call actual logic
      const date = new Date();
      date.setDate(date.getDate() + 1);
      return JSON.stringify([{ data: date.toISOString().split("T")[0], hora: "09:00" }]);
    } catch (e) {
      return JSON.stringify({ error: e.message });
    }
  },
  {
    name: "get_available_slots",
    description: "Gera horários disponíveis para o cliente agendar",
    schema: z.object({})
  }
);

export const agentTools = [
  createClientTool,
  updateClientDataTool,
  scheduleAppointmentTool,
  updateAppointmentTool,
  getAvailableSlotsTool
];

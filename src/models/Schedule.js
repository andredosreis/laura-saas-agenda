import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
  dayOfWeek: {
    type: Number,
    required: true,
    min: 0, // 0 para Domingo, 1 para Segunda, etc.
    max: 6,
    unique: true, // Garante que só haverá um documento por dia da semana
  },
  label: {
    type: String,
    required: true,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  startTime: {
    type: String,
    default: '09:00',
  },
  endTime: {
    type: String,
    default: '18:00',
  },
  breakStartTime: {
    type: String,
    default: '12:00',
  },
  breakEndTime: {
    type: String,
    default: '13:00',
  },
}, { timestamps: true });

const Schedule = mongoose.model('Schedule', scheduleSchema);

export default Schedule;
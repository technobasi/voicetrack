import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFallbackStorage,
  createFullBackup,
  deleteSessionRecord,
  getAllSessions,
  loadVoiceSettings,
  restoreFromBackup,
  saveSessionRecord,
  saveVoiceSettings,
} from '../db';
import { DEFAULT_VOICE_SETTINGS, TrainingSessionRecord } from '../../types/voice';

describe('storage & cross-device backup', () => {
  beforeEach(() => {
    clearFallbackStorage();
  });

  it('persists and loads custom voice settings', () => {
    const defaults = loadVoiceSettings();
    expect(defaults.feminineMinHz).toBe(DEFAULT_VOICE_SETTINGS.feminineMinHz);

    saveVoiceSettings({ ...defaults, feminineMinHz: 192, targetMinHz: 190 });
    const loaded = loadVoiceSettings();
    expect(loaded.feminineMinHz).toBe(192);
    expect(loaded.targetMinHz).toBe(190);
  });

  it('saves, lists, exports, and restores training sessions', async () => {
    const record: TrainingSessionRecord = {
      id: 'test_session_1',
      createdAt: new Date().toISOString(),
      type: 'discord-live',
      title: 'Test Discord Session',
      tags: ['Discord'],
      notes: 'Gute Resonanz',
      stats: {
        meanHz: 202,
        medianHz: 201,
        minHz: 178,
        maxHz: 229,
        stdDevHz: 12,
        semitoneRange: 3.5,
        femininePercent: 82,
        androgynousPercent: 18,
        masculinePercent: 0,
        targetHitPercent: 79,
        meanF1Hz: 610,
        meanF2Hz: 2060,
        meanBrightness: 77,
        totalDurationSec: 300,
        activeSpeakingSec: 120,
        voicedSampleCount: 800,
      },
      pitchTrace: [{ t: 0.1, hz: 202, f2: 2060, b: 77 }],
    };

    await saveSessionRecord(record);
    const sessions = await getAllSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].title).toBe('Test Discord Session');

    const backup = await createFullBackup();
    expect(backup.sessions.length).toBe(1);

    await deleteSessionRecord('test_session_1');
    const afterDelete = await getAllSessions();
    expect(afterDelete.length).toBe(0);

    const restored = await restoreFromBackup(backup);
    expect(restored.sessionsImported).toBe(1);
    const afterRestore = await getAllSessions();
    expect(afterRestore.length).toBe(1);
    expect(afterRestore[0].stats.meanHz).toBe(202);
  });
});

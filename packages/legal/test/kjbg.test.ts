import { describe, expect, it } from 'vitest';
import { regimeFor } from '../src/evaluate.js';
import {
  checkMinorBreak,
  checkMinorDailyMaximum,
  checkMinorNightBan,
  checkMinorNightRest,
  checkMinorWeekendRest,
  checkMinorWeeklyMaximum,
} from '../src/kjbg.js';
import { ageOn, isMinorOn } from '../src/work.js';
import { day, erwachsene, free, lehrling, lehrlingVertrag, vollzeit } from './fixtures.js';

describe('Wechsel des Regelwerks am 18. Geburtstag', () => {
  // Jonas Steiner ist am 17. September 2008 geboren.
  it('rechnet das vollendete Lebensalter tagesgenau', () => {
    expect(ageOn('2008-09-17', '2026-09-16')).toBe(17);
    expect(ageOn('2008-09-17', '2026-09-17')).toBe(18);
    expect(ageOn('2008-09-17', '2027-01-01')).toBe(18);
  });

  it('unterstellt ihn am Vortag dem KJBG und am Geburtstag dem AZG', () => {
    expect(isMinorOn(lehrling, '2026-09-16')).toBe(true);
    expect(isMinorOn(lehrling, '2026-09-17')).toBe(false);
    expect(regimeFor(lehrling, lehrlingVertrag, '2026-09-16')).toBe('kjbg');
    expect(regimeFor(lehrling, lehrlingVertrag, '2026-09-17')).toBe('azg');
  });

  it('lässt Erwachsene unberührt', () => {
    expect(isMinorOn(erwachsene, '2026-09-17')).toBe(false);
    expect(regimeFor(erwachsene, vollzeit, '2026-09-17')).toBe('azg');
  });

  it('nimmt leitende Angestellte und freie Dienstnehmer aus', () => {
    expect(regimeFor(erwachsene, { ...vollzeit, category: 'leitend' }, '2026-09-17')).toBe('ausgenommen');
    expect(regimeFor(erwachsene, { ...vollzeit, exemptFromAzg: true }, '2026-09-17')).toBe('ausgenommen');
    expect(
      regimeFor(erwachsene, { ...vollzeit, category: 'freier_dienstnehmer' }, '2026-09-17'),
    ).toBe('ausgenommen');
  });
});

describe('§ 11 KJBG — Arbeitszeit Jugendlicher', () => {
  it('lässt acht Stunden ohne Anmerkung zu', () => {
    const result = checkMinorDailyMaximum(day('2026-09-14', ['08:00', '12:00'], ['12:30', '16:30']));
    expect(result.severity).toBe('ok');
  });

  // § 11 Abs 2 KJBG erlaubt neun Stunden, aber nur bei anderer Verteilung der
  // Wochenarbeitszeit. Das kann diese Anwendung nicht selbst feststellen —
  // deshalb ein Hinweis statt eines Verstoßes.
  it('meldet neun Stunden als begründungsbedürftig', () => {
    const result = checkMinorDailyMaximum(day('2026-09-14', ['08:00', '12:00'], ['12:30', '17:30']));
    expect(result.severity).toBe('hinweis');
    expect(result.reference).toBe('§ 11 Abs 2 KJBG');
  });

  it('beanstandet alles über neun Stunden', () => {
    const result = checkMinorDailyMaximum(day('2026-09-14', ['08:00', '12:00'], ['12:30', '18:00']));
    expect(result.severity).toBe('verstoss');
    expect(result.actual).toBe(9 * 60 + 30);
  });

  it('beanstandet mehr als 45 Wochenstunden', () => {
    const woche = [
      day('2026-09-14', ['08:00', '12:00'], ['12:30', '18:00']), // 9:30
      day('2026-09-15', ['08:00', '12:00'], ['12:30', '18:00']),
      day('2026-09-16', ['08:00', '12:00'], ['12:30', '18:00']),
      day('2026-09-17', ['08:00', '12:00'], ['12:30', '18:00']),
      day('2026-09-18', ['08:00', '12:00'], ['12:30', '18:00']),
      free('2026-09-19'),
      free('2026-09-20'),
    ];
    const result = checkMinorWeeklyMaximum(woche, '2026-09-14');
    expect(result.actual).toBe(47 * 60 + 30);
    expect(result.severity).toBe('verstoss');
  });
});

describe('§ 15 KJBG — Ruhepause Jugendlicher', () => {
  it('verlangt sie spätestens nach sechs Stunden und ungeteilt', () => {
    const result = checkMinorBreak(day('2026-09-14', ['08:00', '14:30']));
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('darf nicht geteilt werden');
  });

  it('akzeptiert eine durchgehende halbe Stunde nicht in Teilen', () => {
    // Zwei Pausen zu je 15 Minuten genügen beim AZG, beim KJBG nicht.
    const result = checkMinorBreak(
      day('2026-09-14', ['08:00', '10:00'], ['10:15', '13:00'], ['13:15', '17:00']),
    );
    expect(result.severity).toBe('verstoss');
  });

  it('weist ab viereinhalb Stunden auf den Anspruch hin', () => {
    const result = checkMinorBreak(day('2026-09-14', ['08:00', '13:00']));
    expect(result.severity).toBe('hinweis');
    expect(result.message).toContain('viereinhalb Stunden');
  });

  it('ist zufrieden mit einer zusammenhängenden halben Stunde', () => {
    const result = checkMinorBreak(day('2026-09-14', ['08:00', '12:00'], ['12:30', '16:30']));
    expect(result.severity).toBe('ok');
  });
});

describe('§§ 16, 17 KJBG — Nachtruhe und Nachtarbeitsverbot', () => {
  it('beanstandet Arbeit nach 20:00', () => {
    const result = checkMinorNightBan(day('2026-09-14', ['12:00', '20:30']))!;
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('Ende um 20:30');
  });

  it('beanstandet Arbeit vor 06:00', () => {
    const result = checkMinorNightBan(day('2026-09-14', ['05:30', '12:00']))!;
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('Beginn um 05:30');
  });

  it('lässt 06:00 bis 20:00 unbeanstandet', () => {
    expect(checkMinorNightBan(day('2026-09-14', ['06:00', '12:00'], ['12:30', '20:00']))).toBeNull();
  });

  it('verlangt zwölf Stunden Nachtruhe, wo dem AZG elf genügen', () => {
    const gestern = day('2026-09-14', ['11:00', '19:00']);
    const heute = day('2026-09-15', ['06:30', '12:00']);
    const result = checkMinorNightRest(gestern, heute)!;
    expect(result.actual).toBe(11 * 60 + 30);
    expect(result.severity).toBe('verstoss');
  });
});

describe('§§ 18 f KJBG — zwei zusammenhängende freie Tage', () => {
  const arbeitswoche = () => [
    day('2026-09-14', ['08:00', '12:00'], ['12:30', '16:30']),
    day('2026-09-15', ['08:00', '12:00'], ['12:30', '16:30']),
    day('2026-09-16', ['08:00', '12:00'], ['12:30', '16:30']),
    day('2026-09-17', ['08:00', '12:00'], ['12:30', '16:30']),
    day('2026-09-18', ['08:00', '12:00'], ['12:30', '16:30']),
    free('2026-09-19'),
    free('2026-09-20'),
  ];

  it('ist mit freiem Samstag und Sonntag zufrieden', () => {
    expect(checkMinorWeekendRest(arbeitswoche(), '2026-09-14').severity).toBe('ok');
  });

  it('beanstandet Sonntagsarbeit', () => {
    const woche = arbeitswoche();
    woche[6] = day('2026-09-20', ['09:00', '13:00']);
    const result = checkMinorWeekendRest(woche, '2026-09-14');
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('Sonntag');
  });

  it('beanstandet einen einzelnen freien Tag', () => {
    const woche = arbeitswoche();
    woche[5] = day('2026-09-19', ['09:00', '13:00']);
    const result = checkMinorWeekendRest(woche, '2026-09-14');
    expect(result.severity).toBe('verstoss');
    expect(result.message).toContain('zweite');
  });
});

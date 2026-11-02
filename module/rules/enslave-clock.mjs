export const nextEnslaveMinute = time => Number.isFinite(time) ? time + 60 : null;
export const reconciledEnslaveDeadline = (now, seconds) => Number.isFinite(now)
  && Number.isInteger(seconds) && seconds >= 0 && seconds <= 60 ? now + seconds : null;
export function enslaveMinuteDue(flags, now) {
  return flags?.identifier === 'enslave-demon' && Number.isFinite(flags.enslaveNextSave)
    && Number.isFinite(now) && now >= flags.enslaveNextSave ? flags.enslaveNextSave : null;
}

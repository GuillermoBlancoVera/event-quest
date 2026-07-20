export const APP_NAME = 'Event Quest';
export const normalizeAnswer = (value: string) => value.trim().toLocaleLowerCase();
export const isoNow = () => new Date().toISOString();
export const isNonEmpty = (value: string) => value.trim().length > 0;

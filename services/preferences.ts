const KEY_SKIP_FLAG_PROMPT = 'sessioncam_skip_flag_prompt';

export const Preferences = {
  getShouldSkipFlagPrompt: (): boolean => {
    return localStorage.getItem(KEY_SKIP_FLAG_PROMPT) === 'true';
  },

  setShouldSkipFlagPrompt: (shouldSkip: boolean): void => {
    localStorage.setItem(KEY_SKIP_FLAG_PROMPT, shouldSkip ? 'true' : 'false');
  }
};

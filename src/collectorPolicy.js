export function assertUnofficialAdapterAllowed({ enabled = false } = {}) {
    if (!enabled) {
        throw new Error(
            'Instagram unofficial collection is disabled by default. Prefer public-profile, official API surfaces, or score-file; pass --enable-unofficial-adapter only for an approved last-resort run.',
        );
    }
}

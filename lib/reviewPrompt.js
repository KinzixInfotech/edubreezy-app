import * as SecureStore from 'expo-secure-store';

const REVIEW_PROMPT_STATE_KEY = 'appReviewPromptState';
const CANCEL_COOLDOWN_DAYS = 7;
const LOW_RATING_COOLDOWN_DAYS = 21;

const defaultState = {
    loginSuccessCount: 0,
    pending: false,
    dismissedUntil: null,
    completedAt: null,
    lastPromptedAt: null,
    firstSeenAt: null,
    lastLoginQueuedAt: null,
};

function addDays(days) {
    const value = new Date();
    value.setDate(value.getDate() + days);
    return value.toISOString();
}

async function readState() {
    try {
        const raw = await SecureStore.getItemAsync(REVIEW_PROMPT_STATE_KEY);
        if (!raw) return { ...defaultState };
        return { ...defaultState, ...JSON.parse(raw) };
    } catch (error) {
        console.error('[review] failed to read prompt state:', error);
        return { ...defaultState };
    }
}

async function writeState(state) {
    await SecureStore.setItemAsync(REVIEW_PROMPT_STATE_KEY, JSON.stringify(state));
}

export async function queueReviewPromptAfterLogin() {
    const state = await readState();

    if (state.completedAt) {
        return state;
    }

    const now = new Date().toISOString();

    const nextState = {
        ...state,
        loginSuccessCount: (state.loginSuccessCount || 0) + 1,

        firstSeenAt: state.firstSeenAt || now,
        pending: false,

        lastLoginQueuedAt: now,
    };

    await writeState(nextState);
    return nextState;
}

// export async function shouldShowReviewPrompt() {
//     const state = await readState();
//     if (!state.pending || state.completedAt) return false;

//     if (state.dismissedUntil) {
//         const dismissedUntil = new Date(state.dismissedUntil).getTime();
//         if (!Number.isNaN(dismissedUntil) && dismissedUntil > Date.now()) {
//             return false;
//         }
//     }

//     return true;
// }

export async function shouldShowReviewPrompt() {
    const state = await readState();

    if (state.completedAt) return false;

    // ⛔ cooldown check
    if (state.dismissedUntil) {
        const dismissedUntil = new Date(state.dismissedUntil).getTime();
        if (!Number.isNaN(dismissedUntil) && dismissedUntil > Date.now()) {
            return false;
        }
    }

    const now = Date.now();
    const firstSeen = state.firstSeenAt
        ? new Date(state.firstSeenAt).getTime()
        : null;

    const ONE_DAY = 24 * 60 * 60 * 1000;

    // ✅ MAIN LOGIC
    if (
        firstSeen &&
        now - firstSeen > ONE_DAY &&
        state.loginSuccessCount >= 2 &&
        !state.pending
    ) {
        // mark ready
        await writeState({
            ...state,
            pending: true,
        });

        return true;
    }

    return state.pending;
}

export async function markReviewPromptSeen() {
    const state = await readState();
    const nextState = {
        ...state,
        lastPromptedAt: new Date().toISOString(),
    };
    await writeState(nextState);
    return nextState;
}

export async function markReviewPromptDismissed(reason = 'cancel') {
    const state = await readState();
    const cooldownDays = reason === 'low_rating' ? LOW_RATING_COOLDOWN_DAYS : CANCEL_COOLDOWN_DAYS;

    const nextState = {
        ...state,
        pending: false,
        dismissedUntil: addDays(cooldownDays),
        lastPromptedAt: new Date().toISOString(),
    };

    await writeState(nextState);
    return nextState;
}

export async function markReviewPromptCompleted() {
    const state = await readState();
    const nextState = {
        ...state,
        pending: false,
        completedAt: new Date().toISOString(),
        lastPromptedAt: new Date().toISOString(),
    };

    await writeState(nextState);
    return nextState;
}

import { supabase } from './supabase';

const INVALID_RECOVERY_MESSAGE = 'This password reset link is invalid or has expired. Please request a new one.';
const GENERIC_RECOVERY_MESSAGE = 'We could not verify this reset link. Please request a new email and try again.';

const parseParamString = (value = '') =>
    Object.fromEntries(new URLSearchParams(value.replace(/^[?#]/, '')));

export const extractRecoveryParams = (url) => {
    if (!url || typeof url !== 'string') {
        return {};
    }

    const [urlWithoutHash, hash = ''] = url.split('#');
    const queryIndex = urlWithoutHash.indexOf('?');
    const query = queryIndex >= 0 ? urlWithoutHash.slice(queryIndex + 1) : '';

    return {
        ...parseParamString(query),
        ...parseParamString(hash),
    };
};

export const isRecoveryUrl = (url) => {
    if (!url || typeof url !== 'string') {
        return false;
    }

    const params = extractRecoveryParams(url);

    return (
        /reset-password/i.test(url) ||
        params.type === 'recovery' ||
        Boolean(params.access_token && params.refresh_token)
    );
};

export const getRecoveryErrorMessage = (error, fallbackMessage) => {
    const rawMessage = fallbackMessage || error?.message || error?.error_description || error?.description || '';
    const normalized = rawMessage.toLowerCase();

    if (
        normalized.includes('expired') ||
        normalized.includes('invalid') ||
        normalized.includes('grant') ||
        normalized.includes('token') ||
        normalized.includes('otp')
    ) {
        return INVALID_RECOVERY_MESSAGE;
    }

    return rawMessage || GENERIC_RECOVERY_MESSAGE;
};

export const hydrateRecoverySessionFromUrl = async (url) => {
    if (!isRecoveryUrl(url)) {
        return { matched: false };
    }

    const params = extractRecoveryParams(url);
    const explicitError = params.error_description || params.error || params.error_code;

    if (explicitError) {
        return {
            matched: true,
            status: 'error',
            message: getRecoveryErrorMessage(null, explicitError),
        };
    }

    if (!params.access_token || !params.refresh_token) {
        return {
            matched: true,
            status: 'error',
            message: INVALID_RECOVERY_MESSAGE,
        };
    }

    try {
        const { data, error } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
        });

        if (error) {
            throw error;
        }

        return {
            matched: true,
            status: 'ready',
            email: data.session?.user?.email || '',
        };
    } catch (error) {
        return {
            matched: true,
            status: 'error',
            message: getRecoveryErrorMessage(error),
        };
    }
};

export const recoveryErrorMessages = {
    invalid: INVALID_RECOVERY_MESSAGE,
    generic: GENERIC_RECOVERY_MESSAGE,
};

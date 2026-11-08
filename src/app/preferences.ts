type AgentSnapshot = import("../domain/types").AgentSnapshot;
type Config = import("../domain/types").Config;
type PressContext = import("../domain/types").PressContext;
(function (root: any) {
    'use strict';
    const bools: string[] = [
        'allowClipboardFocus',
        'bringToFront',
        'animationEnabled',
        'herdrTitleIdentity',
        'claudeEnabled',
    ], prompts: string[] = ['review', 'tests', 'continue'];
    function normalize(input: any): Record<string,any> {
        if (input === undefined || input === null)
            return {};
        if (typeof input !== 'object' || Array.isArray(input))
            throw Error('Invalid preferences');
        const out: Record<string,any> = {};
        for (const key of Object.keys(input)) {
            if (bools.includes(key)) {
                if (typeof input[key] !== 'boolean')
                    throw Error('Invalid ' + key);
                ((out) as Record<string, any>)[key] = input[key];
            }
            else if (key === 'backend') {
                if (!['rex', 'herdr'].includes(input[key]))
                    throw Error('Choose Rex or Herdr');
                out.backend = input[key];
            }
            else if (key === 'herdrSocketPath') {
                const value: any = input[key];
                if (typeof value !== 'string' ||
                    value.length > 1024 ||
                    /[\x00-\x1f\x7f]/.test(value) ||
                    (value && !(value.startsWith('/') || value.startsWith('~/'))))
                    throw Error('Use an absolute Herdr session socket path');
                out.herdrSocketPath = value;
            }
            else if (key === 'prompts') {
                if (!input.prompts ||
                    typeof input.prompts !== 'object' ||
                    Array.isArray(input.prompts))
                    throw Error('Invalid prompts');
                out.prompts = {};
                for (const name of Object.keys(input.prompts)) {
                    const text: any = input.prompts[name];
                    if (!prompts.includes(name) ||
                        typeof text !== 'string' ||
                        !text.trim() ||
                        /^\s*[!\/]/.test(text) ||
                        text.length > 4000 ||
                        /[\x00-\x1f\x7f]/.test(text))
                        throw Error('Use plain, single-line text (up to 4000 characters)');
                    ((out.prompts) as Record<string, any>)[name] = text;
                }
            }
            else
                throw Error('Unsupported preference');
        }
        return out;
    }
    function apply(base: any, input: any) {
        const p: {} = normalize(input), result: any = {
            ...base,
            animation: { ...base.animation },
            herdr: { ...base.herdr },
            claude: { ...base.claude },
            prompts: { ...base.prompts },
        };
        for (const key of bools)
            if (Object.hasOwn(p, key)) {
                if (key === 'animationEnabled')
                    result.animation.enabled = ((p) as Record<string, any>)[key];
                else if (key === 'claudeEnabled')
                    result.claude.enabled = ((p) as Record<string, any>)[key];
                else if (key === 'herdrTitleIdentity')
                    result.herdr.titleIdentity = ((p) as Record<string, any>)[key];
                else
                    result[key] = ((p) as Record<string, any>)[key];
            }
        if (((p) as any).backend)
            result.backend = ((p) as any).backend;
        if (Object.hasOwn(p, 'herdrSocketPath'))
            result.herdr.socketPath = ((p) as any).herdrSocketPath;
        Object.assign(result.prompts, ((p) as any).prompts || {});
        return result;
    }
    function view(config: Record<string, any>) {
        return {
            claudeEnabled: config.claude?.enabled === true,
            backend: config.backend || 'rex',
            herdrSocketPath: config.herdr?.socketPath || '',
            herdrTitleIdentity: config.herdr?.titleIdentity === true,
            allowClipboardFocus: config.allowClipboardFocus === true,
            bringToFront: config.bringToFront !== false,
            animationEnabled: config.animation?.enabled !== false,
            prompts: Object.fromEntries(prompts.map((name: string) => [name, config.prompts?.[name] || ''])),
        };
    }
    const scopes: string[] = ['rex', 'herdr'], sharedFields: string[] = ['animationEnabled', 'prompts'], profileFields: {
        rex: string[];
        herdr: string[];
    } = {
        rex: ['allowClipboardFocus', 'bringToFront', 'claudeEnabled'],
        herdr: ['herdrSocketPath', 'herdrTitleIdentity', 'claudeEnabled'],
    };
    function subset(input: any, allowed: string[]) {
        const p: {} = normalize(input);
        if (Object.keys(p).some((k: string) => !allowed.includes(k)))
            throw Error('Preference belongs to a different profile');
        return p;
    }
    function store(input: any = {}) {
        if (!input || typeof input !== 'object' || Array.isArray(input))
            throw Error('Invalid saved preferences');
        if (input.version === 2) {
            if (!Number.isSafeInteger(input.revision) ||
                input.revision < 0 ||
                !input.profiles ||
                typeof input.profiles !== 'object' ||
                Array.isArray(input.profiles) ||
                Object.keys(input.profiles).some((k: string) => !scopes.includes(k)))
                throw Error('Invalid profile preferences');
            return {
                version: 2,
                revision: input.revision,
                shared: subset(input.shared || {}, sharedFields),
                profiles: Object.fromEntries(scopes.map((scope: string) => [
                    scope,
                    subset(input.profiles[scope] || {}, ((profileFields) as Record<string, any>)[scope]),
                ])),
            };
        }
        if (input.version !== undefined && input.version !== 1)
            throw Error('Saved preferences version unsupported');
        const legacy: {} = normalize(input.preferences), result: {
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } = {
            version: 2,
            revision: 0,
            shared: {},
            profiles: { rex: {}, herdr: {} },
        };
        for (const [key, value] of Object.entries(legacy)) {
            if (sharedFields.includes(key))
                ((result.shared) as Record<string, any>)[key] = value;
            for (const scope of scopes)
                if (((profileFields) as Record<string, any>)[scope].includes(key))
                    ((result.profiles) as Record<string, any>)[scope][key] =
                        value;
        }
        return result;
    }
    function profileConfig(base: any, saved: any, scope: any) {
        if (!scopes.includes(scope))
            throw Error('Unknown controller profile');
        const value: {
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } | {
            version: number;
            revision: any;
            shared: {};
            profiles: {
                [k: string]: {};
            };
        } = store(saved);
        return apply(base, {
            ...value.shared,
            ...((value.profiles) as Record<string, any>)[scope],
            backend: scope,
        });
    }
    function update(saved: any, scope: any, input: any) {
        if (!scopes.includes(scope))
            throw Error('Unknown controller profile');
        const value: {
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } | {
            version: number;
            revision: any;
            shared: {};
            profiles: {
                [k: string]: {};
            };
        } = store(saved), p: Record<string, any> = normalize(input);
        if (((p) as any).backend &&
            ((p) as any).backend !== scope)
            throw Error('Switch controllers using the Stream Deck profile selector');
        for (const [key, item] of Object.entries(p)) {
            if (sharedFields.includes(key)) {
                ((value.shared) as Record<string, any>)[key] =
                    key === 'prompts'
                        ? { ...((value.shared) as any).prompts, ...item }
                        : item;
            }
            else if (((profileFields) as Record<string, any>)[scope].includes(key))
                ((value.profiles) as Record<string, any>)[scope][key] =
                    item;
            else if (key !== 'backend')
                throw Error('Preference belongs to a different profile');
        }
        value.revision++;
        return value;
    }
    function serialize(saved: any) {
        const value: {
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } | {
            version: number;
            revision: any;
            shared: {};
            profiles: {
                [k: string]: {};
            };
        } = store(saved);
        return {
            ...value,
            preferences: {
                ...value.shared,
                ...value.profiles.rex,
                ...Object.fromEntries(Object.entries(value.profiles.herdr).filter(([key]: [
                    string,
                    any
                ]) => key !== 'claudeEnabled')),
                backend: 'rex',
            },
        };
    }
    function scopeOf(settings: any) {
        return settings?.profileScope === undefined
            ? 'rex'
            : scopes.includes(settings.profileScope)
                ? settings.profileScope
                : null;
    }
    const api: {
        normalize: (input: any) => {};
        apply: (base: any, input: any) => any;
        view: (config: Record<string, any>) => {
            claudeEnabled: boolean;
            backend: any;
            herdrSocketPath: any;
            herdrTitleIdentity: boolean;
            allowClipboardFocus: boolean;
            bringToFront: boolean;
            animationEnabled: boolean;
            prompts: {
                [k: string]: any;
            };
        };
        store: (input?: any) => {
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } | {
            version: number;
            revision: any;
            shared: {};
            profiles: {
                [k: string]: {};
            };
        };
        profileConfig: (base: any, saved: any, scope: any) => any;
        update: (saved: any, scope: any, input: any) => {
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } | {
            version: number;
            revision: any;
            shared: {};
            profiles: {
                [k: string]: {};
            };
        };
        serialize: (saved: any) => {
            preferences: {
                backend: string;
            };
            version: number;
            revision: number;
            shared: {};
            profiles: {
                rex: {};
                herdr: {};
            };
        } | {
            preferences: {
                backend: string;
            };
            version: number;
            revision: any;
            shared: {};
            profiles: {
                [k: string]: {};
            };
        };
        scopeOf: (settings: any) => any;
    } = {
        normalize,
        apply,
        view,
        store,
        profileConfig,
        update,
        serialize,
        scopeOf,
    };
    if (typeof module !== 'undefined' && module.exports)
        module.exports = api;
    else
        root.RexPreferences = api;
})(typeof globalThis === 'object' ? globalThis : this);

export {};


export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok: boolean;
                            version: string;
                            objects: number;
                            posts: number;
                            cards: number;
                            images_indexed: number;
                            notes: string[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/feed": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: {
                    tab?: "for_you" | "following" | "new" | "targets";
                    cursor?: number;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tab: string;
                            items: {
                                post: {
                                    id: string;
                                    object_id: string;
                                    type: string;
                                    title: string;
                                    caption: string;
                                    band: string | null;
                                    wavelength_um: number[] | null;
                                    date_range: string[];
                                    cover: string;
                                    frames: {
                                        src: string;
                                        t: string;
                                        mjd: number;
                                        band: string;
                                        wavelength_um: number[] | null;
                                        release: string;
                                        fov_deg: number;
                                        kind: string;
                                        flags: {
                                            saturated_frac: number;
                                            cosmic_ray: boolean;
                                            satellite: boolean;
                                            persistence: boolean;
                                        };
                                    }[];
                                    chart: string | null;
                                    marks: {
                                        frame: number;
                                        x: number;
                                        y: number;
                                    }[];
                                    flags_summary: {
                                        saturated: number;
                                        cosmic_ray: number;
                                        satellite: number;
                                        persistence: number;
                                    };
                                };
                                object: {
                                    id: string;
                                    handle: string;
                                    name: string;
                                    kind: string;
                                    avatar: string;
                                    official_target: boolean;
                                    saturation: string;
                                    verdict: string;
                                    best_bands: string[];
                                    has_new_data: boolean;
                                    last_seen: string;
                                };
                                tags: {
                                    mine: string[];
                                    counts: {
                                        [key: string]: number;
                                    } | null;
                                };
                            }[];
                            next_cursor: number | null;
                            notice: string | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/stories": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            stories: {
                                object: {
                                    id: string;
                                    handle: string;
                                    name: string;
                                    kind: string;
                                    avatar: string;
                                    official_target: boolean;
                                    saturation: string;
                                    verdict: string;
                                    best_bands: string[];
                                    has_new_data: boolean;
                                    last_seen: string;
                                };
                                post_id: string | null;
                                frames: {
                                    src: string;
                                    t: string;
                                    band: string;
                                }[];
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/objects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            objects: {
                                id: string;
                                handle: string;
                                name: string;
                                kind: string;
                                avatar: string;
                                official_target: boolean;
                                saturation: string;
                                verdict: string;
                                best_bands: string[];
                                has_new_data: boolean;
                                last_seen: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/objects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: string;
                            handle: string;
                            name: string;
                            aliases: string[];
                            kind: string;
                            official_target: boolean;
                            ra: number;
                            dec: number;
                            epoch: string;
                            pm_ra_cosdec: number | null;
                            pm_dec: number | null;
                            parallax: number | null;
                            mags: {
                                [key: string]: number | null;
                            };
                            saturation: string;
                            saturation_source: string;
                            verdict: string;
                            best_bands: string[];
                            n_images: number;
                            n_passes: number;
                            first_seen: string;
                            last_seen: string;
                            avatar: string;
                            has_new_data: boolean;
                            bio: string;
                            facts: {
                                label: string;
                                value: number | string;
                                unit: string | null;
                                source_id: string;
                            }[];
                            sources: {
                                id: string;
                                label: string;
                                url: string;
                            }[];
                            measurements: {
                                motion?: string;
                                lightcurve?: string;
                                spectra?: string;
                            };
                            limits: string[];
                            field: {
                                fov_deg: number;
                                ra: number | null;
                                dec: number | null;
                            };
                            pack: string | null;
                            overlays: {
                                gaia: string | null;
                                wise: string | null;
                            };
                            stats: {
                                posts: number;
                                passes: number;
                                followers: number;
                            };
                            following: boolean;
                        };
                    };
                };
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/objects/{id}/posts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            posts: {
                                id: string;
                                object_id: string;
                                type: string;
                                title: string;
                                caption: string;
                                band: string | null;
                                wavelength_um: number[] | null;
                                date_range: string[];
                                cover: string;
                                frames: {
                                    src: string;
                                    t: string;
                                    mjd: number;
                                    band: string;
                                    wavelength_um: number[] | null;
                                    release: string;
                                    fov_deg: number;
                                    kind: string;
                                    flags: {
                                        saturated_frac: number;
                                        cosmic_ray: boolean;
                                        satellite: boolean;
                                        persistence: boolean;
                                    };
                                }[];
                                chart: string | null;
                                marks: {
                                    frame: number;
                                    x: number;
                                    y: number;
                                }[];
                                flags_summary: {
                                    saturated: number;
                                    cosmic_ray: number;
                                    satellite: number;
                                    persistence: number;
                                };
                            }[];
                        };
                    };
                };
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            post: {
                                id: string;
                                object_id: string;
                                type: string;
                                title: string;
                                caption: string;
                                band: string | null;
                                wavelength_um: number[] | null;
                                date_range: string[];
                                cover: string;
                                frames: {
                                    src: string;
                                    t: string;
                                    mjd: number;
                                    band: string;
                                    wavelength_um: number[] | null;
                                    release: string;
                                    fov_deg: number;
                                    kind: string;
                                    flags: {
                                        saturated_frac: number;
                                        cosmic_ray: boolean;
                                        satellite: boolean;
                                        persistence: boolean;
                                    };
                                }[];
                                chart: string | null;
                                marks: {
                                    frame: number;
                                    x: number;
                                    y: number;
                                }[];
                                flags_summary: {
                                    saturated: number;
                                    cosmic_ray: number;
                                    satellite: number;
                                    persistence: number;
                                };
                            };
                            object: {
                                id: string;
                                handle: string;
                                name: string;
                                kind: string;
                                avatar: string;
                                official_target: boolean;
                                saturation: string;
                                verdict: string;
                                best_bands: string[];
                                has_new_data: boolean;
                                last_seen: string;
                            };
                            tags: {
                                mine: string[];
                                counts: {
                                    [key: string]: number;
                                } | null;
                            };
                            my_marks: {
                                frame: number;
                                x: number;
                                y: number;
                            }[];
                            community_marks: {
                                people: number;
                                frames: {
                                    frame: number;
                                    x: number;
                                    y: number;
                                    n: number;
                                }[];
                            } | null;
                        };
                    };
                };
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    q: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            query: string;
                            objects: ({
                                id: string;
                                handle: string;
                                name: string;
                                kind: string;
                                avatar: string;
                                official_target: boolean;
                                saturation: string;
                                verdict: string;
                                best_bands: string[];
                                has_new_data: boolean;
                                last_seen: string;
                            } & {
                                separation_deg: number | null;
                            })[];
                            spot: {
                                name: string | null;
                                ra: number;
                                dec: number;
                                source: string;
                                epoch: number | null;
                                moved_arcsec: number | null;
                                stale: boolean;
                                moving: boolean;
                            } | null;
                            resolved: boolean;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/sky": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    ra: number;
                    dec: number;
                    fov?: number;
                    band?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ra: number;
                            dec: number;
                            fov: number;
                            band: string | null;
                            source: string;
                            cell: number | null;
                            total: number;
                            releases: string[];
                            bands: {
                                [key: string]: number;
                            };
                            images: {
                                key: string;
                                release: string;
                                band: string;
                                mjd: number;
                                iso: string;
                                lam_um: number | null;
                                lam_min: number;
                                lam_max: number;
                                obs_id: string | null;
                                file_size: number | null;
                            }[];
                            nearby: ({
                                id: string;
                                handle: string;
                                name: string;
                                kind: string;
                                avatar: string;
                                official_target: boolean;
                                saturation: string;
                                verdict: string;
                                best_bands: string[];
                                has_new_data: boolean;
                                last_seen: string;
                            } & {
                                separation_deg: number | null;
                            })[];
                            total_file_bytes: number | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/cutout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query: {
                    key: string;
                    ra: number;
                    dec: number;
                    size?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                nickname: string;
                                created_at: number;
                            } | null;
                        };
                    };
                };
            };
        };
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        nickname: string;
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                nickname: string;
                                created_at: number;
                            } | null;
                        };
                    };
                };
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                nickname: string;
                                created_at: number;
                            } | null;
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/{id}/tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        tag: "asteroid" | "artifact" | "brightness" | "unsure";
                        on: boolean;
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tags: {
                                mine: string[];
                                counts: {
                                    [key: string]: number;
                                } | null;
                            };
                            xp: {
                                xp: number;
                                streakBonus: number;
                                streak: number;
                                reason: string;
                            } | null;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/posts/{id}/marks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        marks: {
                            frame: number;
                            x: number;
                            y: number;
                        }[];
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            saved: number;
                            xp: {
                                xp: number;
                                streakBonus: number;
                                streak: number;
                                reason: string;
                            };
                            new_badges: string[];
                            my_marks: {
                                frame: number;
                                x: number;
                                y: number;
                            }[];
                            community_marks: {
                                people: number;
                                frames: {
                                    frame: number;
                                    x: number;
                                    y: number;
                                    n: number;
                                }[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/objects/{id}/follow": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        on: boolean;
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            following: boolean;
                            followers: number;
                            xp: {
                                xp: number;
                                streakBonus: number;
                                streak: number;
                                reason: string;
                            } | null;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/learn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        event: "band_seen" | "spectrum_opened" | "object_viewed";
                        ref: string;
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            new_badges: string[];
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: string;
                                nickname: string;
                                created_at: number;
                            };
                            xp: number;
                            xp_today: number;
                            daily_cap: number;
                            streak: number;
                            level: {
                                level: number;
                                key: string;
                                min_xp: number;
                                next_min_xp: number | null;
                                progress: number;
                            };
                            levels: {
                                level: number;
                                key: string;
                                min_xp: number;
                            }[];
                            badges: {
                                key: string;
                                earned_at: number | null;
                            }[];
                            counts: {
                                votes: number;
                                marks: number;
                                tags: number;
                                following: number;
                            };
                            following: {
                                id: string;
                                handle: string;
                                name: string;
                                kind: string;
                                avatar: string;
                                official_target: boolean;
                                saturation: string;
                                verdict: string;
                                best_bands: string[];
                                has_new_data: boolean;
                                last_seen: string;
                            }[];
                            history: {
                                type: string;
                                ref: string;
                                detail: string;
                                created_at: number;
                                status: string | null;
                                post: {
                                    id: string;
                                    title: string;
                                    object_id: string;
                                    cover: string;
                                } | null;
                            }[];
                        };
                    };
                };
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            alerts: {
                                id: string;
                                type: string;
                                ref: string;
                                detail: string;
                                created_at: number;
                                read: boolean;
                                object: {
                                    id: string;
                                    handle: string;
                                    name: string;
                                    kind: string;
                                    avatar: string;
                                    official_target: boolean;
                                    saturation: string;
                                    verdict: string;
                                    best_bands: string[];
                                    has_new_data: boolean;
                                    last_seen: string;
                                } | null;
                            }[];
                            unread: number;
                        };
                    };
                };
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/alerts/read": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ids: string[];
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok: boolean;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/community/goals": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            goals: {
                                key: string;
                                target: number;
                                count: number;
                                month: string;
                            }[];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/classify/next": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            done: boolean;
                            card: {
                                id: string;
                                sprite: string;
                                tile: number;
                                n_frames: number;
                                frames: {
                                    t: string;
                                    mjd: number;
                                    n_exp: number;
                                }[];
                            } | null;
                        };
                    };
                };
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/classify/votes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        card_id: string;
                        label: "real" | "artifact" | "unsure";
                    };
                };
            };
            responses: {
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            counted: boolean;
                            xp: {
                                xp: number;
                                streakBonus: number;
                                streak: number;
                                reason: string;
                            };
                            reveal: {
                                kind: string;
                                band: string;
                                size_arcmin: number;
                                frames: {
                                    t: string;
                                    wl_min: number;
                                    wl_max: number;
                                }[];
                                known: {
                                    name: string;
                                    V: number | null;
                                    rate_arcsec_h: number | null;
                                } | null;
                                rate_arcsec_h: number | null;
                                ra: number;
                                dec: number;
                                marks: {
                                    u: number;
                                    v: number;
                                }[];
                                control: {
                                    truth: string;
                                    correct: boolean | null;
                                } | null;
                                p_real: number | null;
                                votes: {
                                    real: number;
                                    artifact: number;
                                    unsure: number;
                                };
                                status: string;
                            };
                            new_badges: string[];
                        };
                    };
                };
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            error: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            error: string;
        };
        ObjectCard: {
            id: string;
            handle: string;
            name: string;
            kind: string;
            avatar: string;
            official_target: boolean;
            saturation: string;
            verdict: string;
            best_bands: string[];
            has_new_data: boolean;
            last_seen: string;
        };
        Frame: {
            src: string;
            t: string;
            mjd: number;
            band: string;
            wavelength_um: number[] | null;
            release: string;
            fov_deg: number;
            kind: string;
            flags: {
                saturated_frac: number;
                cosmic_ray: boolean;
                satellite: boolean;
                persistence: boolean;
            };
        };
        TagSummary: {
            mine: string[];
            counts: {
                [key: string]: number;
            } | null;
        };
        Post: {
            id: string;
            object_id: string;
            type: string;
            title: string;
            caption: string;
            band: string | null;
            wavelength_um: number[] | null;
            date_range: string[];
            cover: string;
            frames: {
                src: string;
                t: string;
                mjd: number;
                band: string;
                wavelength_um: number[] | null;
                release: string;
                fov_deg: number;
                kind: string;
                flags: {
                    saturated_frac: number;
                    cosmic_ray: boolean;
                    satellite: boolean;
                    persistence: boolean;
                };
            }[];
            chart: string | null;
            marks: {
                frame: number;
                x: number;
                y: number;
            }[];
            flags_summary: {
                saturated: number;
                cosmic_ray: number;
                satellite: number;
                persistence: number;
            };
        };
        FeedItem: {
            post: {
                id: string;
                object_id: string;
                type: string;
                title: string;
                caption: string;
                band: string | null;
                wavelength_um: number[] | null;
                date_range: string[];
                cover: string;
                frames: {
                    src: string;
                    t: string;
                    mjd: number;
                    band: string;
                    wavelength_um: number[] | null;
                    release: string;
                    fov_deg: number;
                    kind: string;
                    flags: {
                        saturated_frac: number;
                        cosmic_ray: boolean;
                        satellite: boolean;
                        persistence: boolean;
                    };
                }[];
                chart: string | null;
                marks: {
                    frame: number;
                    x: number;
                    y: number;
                }[];
                flags_summary: {
                    saturated: number;
                    cosmic_ray: number;
                    satellite: number;
                    persistence: number;
                };
            };
            object: {
                id: string;
                handle: string;
                name: string;
                kind: string;
                avatar: string;
                official_target: boolean;
                saturation: string;
                verdict: string;
                best_bands: string[];
                has_new_data: boolean;
                last_seen: string;
            };
            tags: {
                mine: string[];
                counts: {
                    [key: string]: number;
                } | null;
            };
        };
        Xp: {
            xp: number;
            streakBonus: number;
            streak: number;
            reason: string;
        };
        User: {
            id: string;
            nickname: string;
            created_at: number;
        };
        Reveal: {
            kind: string;
            band: string;
            size_arcmin: number;
            frames: {
                t: string;
                wl_min: number;
                wl_max: number;
            }[];
            known: {
                name: string;
                V: number | null;
                rate_arcsec_h: number | null;
            } | null;
            rate_arcsec_h: number | null;
            ra: number;
            dec: number;
            marks: {
                u: number;
                v: number;
            }[];
            control: {
                truth: string;
                correct: boolean | null;
            } | null;
            p_real: number | null;
            votes: {
                real: number;
                artifact: number;
                unsure: number;
            };
            status: string;
        };
        DeckCard: {
            id: string;
            sprite: string;
            tile: number;
            n_frames: number;
            frames: {
                t: string;
                mjd: number;
                n_exp: number;
            }[];
        };
        Spot: {
            name: string | null;
            ra: number;
            dec: number;
            source: string;
            epoch: number | null;
            moved_arcsec: number | null;
            stale: boolean;
            moving: boolean;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;

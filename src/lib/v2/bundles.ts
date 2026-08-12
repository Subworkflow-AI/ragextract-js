import type { ApiClient, ApiResponse } from '../client';
import type { Bundle, BundleFile } from './types';

type BundleWithFiles = { bundle: Bundle; files: BundleFile[] };

/**
 * Bundles — several files a table row extracts as one subject (a master contract and its
 * amendments), resolved by map-reduce with a precedence order.
 *
 * Members are addressed by `fileId`, not by a membership id: the caller already has the file id,
 * and making them read the bundle first to learn a synthetic one buys nothing.
 *
 * Every membership change marks derived cells stale in EVERY table using the bundle, not just the
 * one you were looking at — that is the point of sharing a bundle, and it is worth knowing before
 * adding a document to one used in several places.
 */
export class V2BundlesAPI {
    constructor(
        private readonly api: ApiClient,
        private readonly workspaceId: string,
    ) {}

    private get base() {
        return `/workspaces/${this.workspaceId}/bundles`;
    }

    private unwrap = async <T>(req: Response): Promise<T | null> => {
        const res = (await req.json()) as ApiResponse<T>;
        if (res.error) throw new Error(res.error);
        return res.data ?? null;
    };

    list = async () => this.unwrap<Bundle[]>(await this.api.$get(this.base));

    get = async (bundleId: string) =>
        this.unwrap<BundleWithFiles>(await this.api.$get(`${this.base}/${bundleId}`));

    create = async (data: { name: string; color?: string | null; fileIds?: string[] }) =>
        this.unwrap<Bundle>(await this.api.$post(this.base, { json: data as never }));

    update = async (bundleId: string, patch: { name?: string; color?: string | null }) =>
        this.unwrap<Bundle>(await this.api.$patch(`${this.base}/${bundleId}`, { json: patch as never }));

    /**
     * Archives the bundle. Refused while any table row still points at it — the API names the
     * tables so the caller can act, rather than leaving those rows referencing nothing.
     */
    delete = async (bundleId: string) =>
        this.unwrap<Bundle>(await this.api.$delete(`${this.base}/${bundleId}`));

    addFiles = async (
        bundleId: string,
        fileIds: string[],
        opts?: {
            /** Applied to the first file added; a bundle has at most one structural anchor. */
            isPrimary?: boolean;
            role?: string | null;
            /** Epoch ms. Precedence for the reduce step, latest first. */
            effectiveAt?: number | null;
        },
    ) =>
        this.unwrap<BundleWithFiles>(
            await this.api.$post(`${this.base}/${bundleId}/files`, {
                json: { fileIds, ...opts } as never,
            }),
        );

    /** These three fields ARE the precedence, so editing them changes the answer. */
    updateFile = async (
        bundleId: string,
        fileId: string,
        patch: Partial<{ isPrimary: boolean; role: string | null; effectiveAt: number | null; sortOrder: number }>,
    ) =>
        this.unwrap<BundleFile>(
            await this.api.$patch(`${this.base}/${bundleId}/files/${fileId}`, { json: patch as never }),
        );

    removeFile = async (bundleId: string, fileId: string) =>
        this.unwrap<never>(await this.api.$delete(`${this.base}/${bundleId}/files/${fileId}`));
}

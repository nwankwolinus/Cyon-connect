import "server-only";
import { createAdminSupabaseClient } from "@/infrastructure/supabase/admin";

const bucket = "membership-applicant-photos";

export function createSupabasePassportPhotoStorage(fetchImplementation?: typeof fetch) {
  const storage = createAdminSupabaseClient(fetchImplementation).storage.from(bucket);
  async function removeObject(path: string): Promise<"deleted" | "already_absent"> {
    const { error } = await storage.remove([path]);
    if (!error) return "deleted";
    const candidate = error as unknown as { status?: unknown; code?: unknown };
    if (candidate.status === 404 && candidate.code === "NoSuchKey") return "already_absent";
    throw new Error("photo_unavailable");
  }
  return {
    async upload(path: string, bytes: Buffer) {
      const { error } = await storage.upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "0",
      });
      if (error) throw new Error("photo_unavailable");
    },
    async download(path: string): Promise<Buffer> {
      const { data, error } = await storage.download(path);
      if (error || !data) throw new Error("photo_unavailable");
      return Buffer.from(await data.arrayBuffer());
    },
    async remove(path: string) {
      await removeObject(path);
    },
    async removeForCleanup(path: string) {
      return removeObject(path);
    },
  };
}

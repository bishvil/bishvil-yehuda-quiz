import { redirect } from "next/navigation";

/** Redirect legacy bookmark to the new brand library page. */
export default function AdminBrandSettingsRedirectPage() {
  redirect("/admin/settings/brands");
}

import { redirect } from "next/navigation";

import { HOME_PATH } from "@/components/shell/navigation";

/** "/" has no page of its own until the Overview (Stage 10); until then it leads home. */
export default function Root(): never {
  redirect(HOME_PATH);
}

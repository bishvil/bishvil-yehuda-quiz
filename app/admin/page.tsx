import { redirect } from "next/navigation";

/** Admin landing → quizzes list. */
export default function AdminRoot() {
  redirect("/admin/quizzes");
}

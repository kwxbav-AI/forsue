import { redirect } from "next/navigation";

export default function SupervisorsRedirectPage() {
  redirect("/settings/users");
}

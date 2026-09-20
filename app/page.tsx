import { redirect } from "next/navigation";

export default function HomePage() {
  // Domyślne przekierowanie do panelu logowania prywatnego
  redirect("/login");
}

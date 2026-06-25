import CheckoutWidget from "./checkout-widget";
import { demoBooks } from "@/lib/catalog";

export default function Page() {
  return <CheckoutWidget books={demoBooks} />;
}

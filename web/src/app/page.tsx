import Commands from "./commands";
import Features from "./features";
import { Cta, Footer } from "./footer";
import Hero from "./hero";

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <Hero />
        <Features />
        <Commands />
        <Cta />
      </main>
      <Footer />
    </>
  );
}

import Commands from "./commands";
import Features from "./features";
import { Cta, Footer } from "./footer";
import Hero from "./hero";
import Nav from "./nav";

export default function Home() {
  return (
    <>
      <span id="top" />
      <Nav />
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

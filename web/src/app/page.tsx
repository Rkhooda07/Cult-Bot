import Commands from "./commands";
import Features from "./features";
import Hero from "./hero";

export default function Home() {
  return (
    <main className="flex-1">
      <Hero />
      <Features />
      <Commands />
    </main>
  );
}

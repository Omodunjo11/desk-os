import AddProcessForm from "@/components/AddProcessForm";

export default function StudioPage() {
  return (
    <main className="page">
      <p className="kicker">Add process</p>
      <h1>Plug a new workflow in.</h1>
      <p className="lede">
        Every process runs the same loop: identify, prioritize, act, learn. Pick a
        template built for how the work already gets judged, name this instance, and
        optionally check how a source export would map before anything goes live.
      </p>
      <AddProcessForm />
    </main>
  );
}

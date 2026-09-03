// Setup form: server component; a plain GET form navigates to /session with query params.
export default function Home() {
  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold">ReadPulse</h1>
        <p className="text-sm text-gray-600">
          Read a short passage aloud and get an instant reading report.
        </p>
      </header>

      <form action="/session" method="get" className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="childName" className="block text-sm font-semibold">
            Child&apos;s first name
          </label>
          <input
            id="childName"
            name="childName"
            type="text"
            className="w-full rounded border px-3 py-2"
            placeholder="Optional"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="grade" className="block text-sm font-semibold">
            Grade
          </label>
          <select id="grade" name="grade" defaultValue="3" className="w-full rounded border px-3 py-2">
            {[1, 2, 3, 4, 5, 6].map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="season" className="block text-sm font-semibold">
            Season
          </label>
          <select id="season" name="season" defaultValue="winter" className="w-full rounded border px-3 py-2">
            <option value="fall">Fall</option>
            <option value="winter">Winter</option>
            <option value="spring">Spring</option>
          </select>
        </div>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Start session
        </button>

        <p className="text-xs text-gray-500">
          Grade 1 fall has no published norms - choose winter or spring.
        </p>
      </form>
    </div>
  );
}

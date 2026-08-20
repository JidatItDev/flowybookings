const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export const handlers = {
  OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders }),
  POST: async () =>
    new Response(
      JSON.stringify({
        error: "gone",
        details: "Mock billing is disabled. Configure Mollie and pay via checkout.",
      }),
      { status: 410, headers: { "Content-Type": "application/json", ...corsHeaders } },
    ),
};

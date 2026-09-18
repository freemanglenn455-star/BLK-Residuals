exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    const { items } = JSON.parse(event.body || "{}");

    if (!Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Your bag is empty." }),
      };
    }

    const secretKey = process.env.STRIPE_SECRET_KEY;

    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured.");
    }

    const params = new URLSearchParams();

    params.append("mode", "payment");
    params.append(
      "success_url",
      "https://radiant-chebakia-53d2dc.netlify.app/?checkout=success"
    );
    params.append(
      "cancel_url",
      "https://radiant-chebakia-53d2dc.netlify.app/?checkout=cancelled"
    );

    params.append("billing_address_collection", "required");
    params.append("phone_number_collection[enabled]", "true");

    items.forEach((item, index) => {
      if (!item.priceId || !String(item.priceId).startsWith("price_")) {
        throw new Error("Invalid Stripe Price ID.");
      }

      const quantity = Math.max(
        1,
        Math.min(10, Number.parseInt(item.quantity, 10) || 1)
      );

      params.append(`line_items[${index}][price]`, item.priceId);
      params.append(`line_items[${index}][quantity]`, String(quantity));
      params.append(
        `line_items[${index}][adjustable_quantity][enabled]`,
        "true"
      );
    });

    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const session = await response.json();

    if (!response.ok) {
      console.error("Stripe error:", session);
      throw new Error(session?.error?.message || "Stripe Checkout failed.");
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (error) {
    console.error("Checkout error:", error);

    return {
      status

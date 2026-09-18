const PRICE_IDS = {
  bomber: 'price_1UGhxTFCHNQtBjUvUN7eT160',
  varsity: 'price_1UGlCQFCHNQtBjUvOYNJSf0F',
  denim: 'price_1UGlXdFCHNQtBjUv5hlKktab',
  hoodie: 'price_1UGlj0FCHNQtBjUvIjCNsNHS',
  tracksuit: 'price_1UGlkvFCHNQtBjUvunAWyPTh',
  hat: 'price_1UGlx1FCHNQtBjUvjYtFJ3Yt'
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { Allow: 'POST' }, body: 'Method Not Allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('Missing STRIPE_SECRET_KEY');
    return { statusCode: 500, body: 'Checkout is not configured' };
  }

  try {
    const { cart = [] } = JSON.parse(event.body || '{}');
    if (!Array.isArray(cart) || cart.length === 0) {
      return { statusCode: 400, body: 'Cart is empty' };
    }

    const grouped = new Map();
    for (const item of cart) {
      if (!item || !PRICE_IDS[item.id]) {
        return { statusCode: 400, body: 'Invalid product' };
      }
      const size = String(item.size || '').slice(0, 20);
      const key = `${item.id}:${size}`;
      const current = grouped.get(key) || { id: item.id, size, quantity: 0 };
      current.quantity += 1;
      if (current.quantity > 20) return { statusCode: 400, body: 'Quantity is too large' };
      grouped.set(key, current);
    }

    const items = [...grouped.values()];
    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('billing_address_collection', 'required');
    form.set('phone_number_collection[enabled]', 'true');
    form.set('shipping_address_collection[allowed_countries][0]', 'US');
    form.set('automatic_tax[enabled]', 'false');
    form.set('allow_promotion_codes', 'false');

    const domain = (process.env.DOMAIN || 'https://radiant-chebakia-53d2dc.netlify.app').replace(/\/$/, '');
    form.set('success_url', `${domain}/success.html?session_id={CHECKOUT_SESSION_ID}`);
    form.set('cancel_url', `${domain}/#drop`);

    items.forEach((item, i) => {
      form.set(`line_items[${i}][price]`, PRICE_IDS[item.id]);
      form.set(`line_items[${i}][quantity]`, String(item.quantity));
      form.set(`line_items[${i}][adjustable_quantity][enabled]`, 'true');
      form.set(`line_items[${i}][adjustable_quantity][minimum]`, '1');
      form.set(`line_items[${i}][adjustable_quantity][maximum]`, '20');
    });

    // Keep selected sizes attached to the Stripe Checkout Session for fulfillment.
    form.set('metadata[blk_cart]', items.map(i => `${i.id}:${i.size || 'N/A'}x${i.quantity}`).join('|').slice(0, 500));

    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });

    const session = await stripeResponse.json();
    if (!stripeResponse.ok || !session.url) {
      console.error('Stripe Checkout error:', session);
      return { statusCode: 502, body: 'Unable to start checkout' };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ url: session.url })
    };
  } catch (error) {
    console.error('Checkout function error:', error);
    return { statusCode: 500, body: 'Unable to start checkout' };
  }
};

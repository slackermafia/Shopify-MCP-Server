#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// ─── Config ────────────────────────────────────────────────────────────────
const SHOPIFY_STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ACCESS_TOKEN) {
  console.error(
    'ERROR: Missing required environment variables: SHOPIFY_STORE_DOMAIN, SHOPIFY_ACCESS_TOKEN'
  );
  process.exit(1);
}

const API_VERSION = '2026-01';
const BASE_URL = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${API_VERSION}`;
const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

// ─── HTTP Helpers ───────────────────────────────────────────────────────────
async function shopifyREST(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify REST ${res.status} on ${path}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

async function shopifyGQL(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify GraphQL ${res.status}: ${body}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function ok(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function err(e) {
  return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
}

// ─── Tool Definitions ───────────────────────────────────────────────────────
const TOOLS = [
  // ── SHOP ────────────────────────────────────────────────────────────────
  {
    name: 'get_shop_info',
    description: 'Get store information (name, domain, currency, plan, contact email, etc.)',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── PRODUCTS ────────────────────────────────────────────────────────────
  {
    name: 'list_products',
    description: 'List products with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 50, max 250)' },
        status: { type: 'string', enum: ['active', 'archived', 'draft'], description: 'Filter by status' },
        title: { type: 'string', description: 'Filter by title' },
        vendor: { type: 'string', description: 'Filter by vendor' },
        product_type: { type: 'string', description: 'Filter by product type' },
        collection_id: { type: 'string', description: 'Filter by collection ID' },
        since_id: { type: 'string', description: 'Paginate: return results after this ID' },
      },
    },
  },
  {
    name: 'get_product',
    description: 'Get a single product by ID (includes variants, images, metafields)',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string', description: 'The product ID' },
      },
    },
  },
  {
    name: 'create_product',
    description: 'Create a new product with optional variants, images, metafields, and tags',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        body_html: { type: 'string', description: 'Product description (HTML)' },
        vendor: { type: 'string' },
        product_type: { type: 'string' },
        status: { type: 'string', enum: ['active', 'draft', 'archived'], default: 'draft' },
        tags: { type: 'string', description: 'Comma-separated tags' },
        variants: {
          type: 'array',
          description: 'List of variants',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              price: { type: 'string' },
              compare_at_price: { type: 'string' },
              sku: { type: 'string' },
              barcode: { type: 'string' },
              inventory_management: { type: 'string', enum: ['shopify', 'not_managed'] },
              inventory_quantity: { type: 'number' },
              weight: { type: 'number' },
              weight_unit: { type: 'string', enum: ['kg', 'g', 'lb', 'oz'] },
              option1: { type: 'string' },
              option2: { type: 'string' },
              option3: { type: 'string' },
              taxable: { type: 'boolean' },
              requires_shipping: { type: 'boolean' },
            },
          },
        },
        options: {
          type: 'array',
          description: 'Product options (e.g. Size, Color)',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              values: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        images: {
          type: 'array',
          description: 'Product images',
          items: {
            type: 'object',
            properties: {
              src: { type: 'string', description: 'Image URL' },
              alt: { type: 'string' },
            },
          },
        },
        metafields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              namespace: { type: 'string' },
              key: { type: 'string' },
              value: { type: 'string' },
              type: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'update_product',
    description: 'Update an existing product',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string' },
        title: { type: 'string' },
        body_html: { type: 'string' },
        vendor: { type: 'string' },
        product_type: { type: 'string' },
        status: { type: 'string', enum: ['active', 'draft', 'archived'] },
        tags: { type: 'string' },
      },
    },
  },
  {
    name: 'delete_product',
    description: 'Delete a product by ID',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: { product_id: { type: 'string' } },
    },
  },
  {
    name: 'publish_product',
    description: 'Publish or unpublish a product (set status to active or draft)',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'published'],
      properties: {
        product_id: { type: 'string' },
        published: { type: 'boolean', description: 'true = active, false = draft' },
      },
    },
  },
  {
    name: 'list_product_variants',
    description: 'List all variants for a product',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'create_product_variant',
    description: 'Add a new variant to a product',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'price'],
      properties: {
        product_id: { type: 'string' },
        price: { type: 'string' },
        compare_at_price: { type: 'string' },
        sku: { type: 'string' },
        barcode: { type: 'string' },
        option1: { type: 'string' },
        option2: { type: 'string' },
        option3: { type: 'string' },
        weight: { type: 'number' },
        weight_unit: { type: 'string' },
        inventory_management: { type: 'string' },
        inventory_quantity: { type: 'number' },
        taxable: { type: 'boolean' },
        requires_shipping: { type: 'boolean' },
      },
    },
  },
  {
    name: 'update_product_variant',
    description: 'Update an existing product variant',
    inputSchema: {
      type: 'object',
      required: ['variant_id'],
      properties: {
        variant_id: { type: 'string' },
        price: { type: 'string' },
        compare_at_price: { type: 'string' },
        sku: { type: 'string' },
        barcode: { type: 'string' },
        option1: { type: 'string' },
        option2: { type: 'string' },
        option3: { type: 'string' },
        weight: { type: 'number' },
        weight_unit: { type: 'string' },
        inventory_management: { type: 'string' },
        taxable: { type: 'boolean' },
        requires_shipping: { type: 'boolean' },
      },
    },
  },
  {
    name: 'delete_product_variant',
    description: 'Delete a variant from a product',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'variant_id'],
      properties: {
        product_id: { type: 'string' },
        variant_id: { type: 'string' },
      },
    },
  },
  {
    name: 'get_product_metafields',
    description: 'Get all metafields for a product',
    inputSchema: {
      type: 'object',
      required: ['product_id'],
      properties: {
        product_id: { type: 'string' },
        namespace: { type: 'string', description: 'Filter by namespace' },
      },
    },
  },
  {
    name: 'set_product_metafield',
    description: 'Create or update a metafield on a product',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'namespace', 'key', 'value', 'type'],
      properties: {
        product_id: { type: 'string' },
        namespace: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
        type: { type: 'string', description: 'e.g. single_line_text_field, number_integer, json, etc.' },
      },
    },
  },
  {
    name: 'add_product_image',
    description: 'Add an image to a product by URL',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'src'],
      properties: {
        product_id: { type: 'string' },
        src: { type: 'string', description: 'Image URL' },
        alt: { type: 'string' },
        variant_ids: { type: 'array', items: { type: 'number' }, description: 'Associate image with specific variants' },
      },
    },
  },

  // ── COLLECTIONS ─────────────────────────────────────────────────────────
  {
    name: 'list_collections',
    description: 'List all custom and smart collections',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        title: { type: 'string' },
      },
    },
  },
  {
    name: 'get_collection',
    description: 'Get a collection by ID',
    inputSchema: {
      type: 'object',
      required: ['collection_id'],
      properties: { collection_id: { type: 'string' } },
    },
  },
  {
    name: 'create_collection',
    description: 'Create a custom collection',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        body_html: { type: 'string' },
        published: { type: 'boolean', default: true },
        image_src: { type: 'string', description: 'Collection image URL' },
        sort_order: { type: 'string', enum: ['alpha-asc', 'alpha-desc', 'best-selling', 'created', 'created-desc', 'manual', 'price-asc', 'price-desc'] },
      },
    },
  },
  {
    name: 'update_collection',
    description: 'Update a custom collection',
    inputSchema: {
      type: 'object',
      required: ['collection_id'],
      properties: {
        collection_id: { type: 'string' },
        title: { type: 'string' },
        body_html: { type: 'string' },
        published: { type: 'boolean' },
        sort_order: { type: 'string' },
      },
    },
  },
  {
    name: 'add_product_to_collection',
    description: 'Add a product to a custom collection',
    inputSchema: {
      type: 'object',
      required: ['collection_id', 'product_id'],
      properties: {
        collection_id: { type: 'string' },
        product_id: { type: 'string' },
      },
    },
  },
  {
    name: 'list_collection_products',
    description: 'List products in a collection',
    inputSchema: {
      type: 'object',
      required: ['collection_id'],
      properties: {
        collection_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },

  // ── ORDERS ──────────────────────────────────────────────────────────────
  {
    name: 'list_orders',
    description: 'List orders with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default 50)' },
        status: { type: 'string', enum: ['open', 'closed', 'cancelled', 'any'], description: 'Order status' },
        financial_status: { type: 'string', enum: ['authorized', 'pending', 'paid', 'partially_paid', 'refunded', 'voided', 'any'] },
        fulfillment_status: { type: 'string', enum: ['shipped', 'partial', 'unshipped', 'unfulfilled', 'any'] },
        created_at_min: { type: 'string', description: 'ISO 8601 date' },
        created_at_max: { type: 'string', description: 'ISO 8601 date' },
        since_id: { type: 'string' },
        customer_id: { type: 'string' },
      },
    },
  },
  {
    name: 'get_order',
    description: 'Get a single order by ID with full details',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: { order_id: { type: 'string' } },
    },
  },
  {
    name: 'create_order',
    description: 'Create a new order',
    inputSchema: {
      type: 'object',
      required: ['line_items'],
      properties: {
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variant_id: { type: 'number' },
              product_id: { type: 'number' },
              title: { type: 'string' },
              quantity: { type: 'number' },
              price: { type: 'string' },
            },
          },
        },
        customer: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            email: { type: 'string' },
          },
        },
        shipping_address: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            address1: { type: 'string' },
            city: { type: 'string' },
            province: { type: 'string' },
            country: { type: 'string' },
            zip: { type: 'string' },
          },
        },
        financial_status: { type: 'string' },
        send_receipt: { type: 'boolean' },
        note: { type: 'string' },
        tags: { type: 'string' },
      },
    },
  },
  {
    name: 'update_order',
    description: 'Update an existing order (note, tags, email, shipping address)',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' },
        note: { type: 'string' },
        tags: { type: 'string' },
        email: { type: 'string' },
        shipping_address: { type: 'object' },
      },
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' },
        reason: { type: 'string', enum: ['customer', 'fraud', 'inventory', 'declined', 'other'] },
        email: { type: 'boolean', description: 'Send cancellation email to customer' },
        restock: { type: 'boolean', description: 'Restock inventory' },
        refund: { type: 'boolean', description: 'Refund payment' },
      },
    },
  },
  {
    name: 'close_order',
    description: 'Close an order (mark as completed)',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: { order_id: { type: 'string' } },
    },
  },
  {
    name: 'fulfill_order',
    description: 'Create a fulfillment for an order',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' },
        location_id: { type: 'string' },
        tracking_number: { type: 'string' },
        tracking_company: { type: 'string' },
        tracking_url: { type: 'string' },
        notify_customer: { type: 'boolean', default: true },
        line_items: {
          type: 'array',
          description: 'Specific line items to fulfill (omit to fulfill all)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              quantity: { type: 'number' },
            },
          },
        },
      },
    },
  },
  {
    name: 'create_refund',
    description: 'Create a refund for an order',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: {
        order_id: { type: 'string' },
        note: { type: 'string' },
        notify: { type: 'boolean', default: true },
        refund_line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line_item_id: { type: 'number' },
              quantity: { type: 'number' },
              restock_type: { type: 'string', enum: ['no_restock', 'cancel', 'return', 'legacy_restock'] },
              location_id: { type: 'number' },
            },
          },
        },
        transactions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              parent_id: { type: 'number' },
              amount: { type: 'string' },
              kind: { type: 'string', enum: ['refund'] },
              gateway: { type: 'string' },
            },
          },
        },
        shipping: {
          type: 'object',
          properties: { full_refund: { type: 'boolean' }, amount: { type: 'string' } },
        },
      },
    },
  },
  {
    name: 'get_order_transactions',
    description: 'Get all transactions for an order',
    inputSchema: {
      type: 'object',
      required: ['order_id'],
      properties: { order_id: { type: 'string' } },
    },
  },

  // ── DRAFT ORDERS ─────────────────────────────────────────────────────────
  {
    name: 'list_draft_orders',
    description: 'List draft orders',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        status: { type: 'string', enum: ['open', 'invoice_sent', 'completed', 'any'] },
      },
    },
  },
  {
    name: 'create_draft_order',
    description: 'Create a draft order',
    inputSchema: {
      type: 'object',
      required: ['line_items'],
      properties: {
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              variant_id: { type: 'number' },
              title: { type: 'string' },
              price: { type: 'string' },
              quantity: { type: 'number' },
            },
          },
        },
        customer: { type: 'object' },
        shipping_address: { type: 'object' },
        note: { type: 'string' },
        tags: { type: 'string' },
        discount: {
          type: 'object',
          properties: {
            value_type: { type: 'string', enum: ['fixed_amount', 'percentage'] },
            value: { type: 'string' },
            title: { type: 'string' },
          },
        },
      },
    },
  },
  {
    name: 'complete_draft_order',
    description: 'Complete a draft order (converts to an order)',
    inputSchema: {
      type: 'object',
      required: ['draft_order_id'],
      properties: {
        draft_order_id: { type: 'string' },
        payment_gateway: { type: 'string' },
      },
    },
  },

  // ── CUSTOMERS ────────────────────────────────────────────────────────────
  {
    name: 'list_customers',
    description: 'List customers',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        since_id: { type: 'string' },
        created_at_min: { type: 'string' },
        created_at_max: { type: 'string' },
        updated_at_min: { type: 'string' },
      },
    },
  },
  {
    name: 'search_customers',
    description: 'Search customers by name, email, or phone',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'Search query (e.g. "email:foo@bar.com" or "John Smith")' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_customer',
    description: 'Get a customer by ID',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: { customer_id: { type: 'string' } },
    },
  },
  {
    name: 'create_customer',
    description: 'Create a new customer',
    inputSchema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        phone: { type: 'string' },
        tags: { type: 'string' },
        note: { type: 'string' },
        accepts_marketing: { type: 'boolean' },
        verified_email: { type: 'boolean' },
        addresses: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              address1: { type: 'string' },
              city: { type: 'string' },
              province: { type: 'string' },
              country: { type: 'string' },
              zip: { type: 'string' },
              phone: { type: 'string' },
            },
          },
        },
        metafields: { type: 'array' },
      },
    },
  },
  {
    name: 'update_customer',
    description: 'Update an existing customer',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: {
        customer_id: { type: 'string' },
        email: { type: 'string' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        phone: { type: 'string' },
        tags: { type: 'string' },
        note: { type: 'string' },
        accepts_marketing: { type: 'boolean' },
      },
    },
  },
  {
    name: 'delete_customer',
    description: 'Delete a customer by ID',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: { customer_id: { type: 'string' } },
    },
  },
  {
    name: 'get_customer_orders',
    description: 'Get all orders for a specific customer',
    inputSchema: {
      type: 'object',
      required: ['customer_id'],
      properties: {
        customer_id: { type: 'string' },
        limit: { type: 'number' },
        status: { type: 'string' },
      },
    },
  },

  // ── INVENTORY ────────────────────────────────────────────────────────────
  {
    name: 'list_locations',
    description: 'List all fulfillment locations for the store',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_inventory_levels',
    description: 'Get inventory levels (filter by location or inventory item)',
    inputSchema: {
      type: 'object',
      properties: {
        location_ids: { type: 'string', description: 'Comma-separated location IDs' },
        inventory_item_ids: { type: 'string', description: 'Comma-separated inventory item IDs' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'adjust_inventory',
    description: 'Adjust inventory quantity for an item at a location (relative adjustment)',
    inputSchema: {
      type: 'object',
      required: ['location_id', 'inventory_item_id', 'available_adjustment'],
      properties: {
        location_id: { type: 'string' },
        inventory_item_id: { type: 'string' },
        available_adjustment: { type: 'number', description: 'Positive to add, negative to subtract' },
      },
    },
  },
  {
    name: 'set_inventory_level',
    description: 'Set absolute inventory quantity for an item at a location',
    inputSchema: {
      type: 'object',
      required: ['location_id', 'inventory_item_id', 'available'],
      properties: {
        location_id: { type: 'string' },
        inventory_item_id: { type: 'string' },
        available: { type: 'number', description: 'Absolute quantity to set' },
      },
    },
  },

  // ── DISCOUNTS / PRICE RULES ──────────────────────────────────────────────
  {
    name: 'list_price_rules',
    description: 'List all price rules (discount types)',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'create_price_rule',
    description: 'Create a price rule (basis for discount codes)',
    inputSchema: {
      type: 'object',
      required: ['title', 'value_type', 'value', 'customer_selection', 'target_type', 'target_selection', 'allocation_method', 'starts_at'],
      properties: {
        title: { type: 'string' },
        value_type: { type: 'string', enum: ['fixed_amount', 'percentage'] },
        value: { type: 'string', description: 'Negative number, e.g. "-10.0" for $10 off or "-25.0" for 25% off' },
        customer_selection: { type: 'string', enum: ['all', 'prerequisite'] },
        target_type: { type: 'string', enum: ['line_item', 'shipping_line'] },
        target_selection: { type: 'string', enum: ['all', 'entitled'] },
        allocation_method: { type: 'string', enum: ['each', 'across'] },
        starts_at: { type: 'string', description: 'ISO 8601 datetime' },
        ends_at: { type: 'string', description: 'ISO 8601 datetime (optional)' },
        usage_limit: { type: 'number', description: 'Total uses allowed (optional)' },
        once_per_customer: { type: 'boolean' },
        minimum_amount: { type: 'string', description: 'Minimum order amount required' },
      },
    },
  },
  {
    name: 'create_discount_code',
    description: 'Create a discount code for an existing price rule',
    inputSchema: {
      type: 'object',
      required: ['price_rule_id', 'code'],
      properties: {
        price_rule_id: { type: 'string' },
        code: { type: 'string', description: 'Discount code string (e.g. SAVE20)' },
      },
    },
  },
  {
    name: 'list_discount_codes',
    description: 'List discount codes for a price rule',
    inputSchema: {
      type: 'object',
      required: ['price_rule_id'],
      properties: { price_rule_id: { type: 'string' } },
    },
  },
  {
    name: 'delete_discount_code',
    description: 'Delete a discount code',
    inputSchema: {
      type: 'object',
      required: ['price_rule_id', 'discount_code_id'],
      properties: {
        price_rule_id: { type: 'string' },
        discount_code_id: { type: 'string' },
      },
    },
  },

  // ── METAOBJECTS (GraphQL) ────────────────────────────────────────────────
  {
    name: 'list_metaobject_definitions',
    description: 'List all metaobject definitions in the store',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 20 } },
    },
  },
  {
    name: 'create_metaobject_definition',
    description: 'Create a new metaobject definition (custom content type)',
    inputSchema: {
      type: 'object',
      required: ['name', 'type', 'fields'],
      properties: {
        name: { type: 'string', description: 'Display name e.g. "FAQ Item"' },
        type: { type: 'string', description: 'Type handle e.g. "faq_item"' },
        description: { type: 'string' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              description: { type: 'string' },
              required: { type: 'boolean' },
            },
          },
        },
      },
    },
  },
  {
    name: 'list_metaobjects',
    description: 'List metaobjects of a specific type',
    inputSchema: {
      type: 'object',
      required: ['type'],
      properties: {
        type: { type: 'string', description: 'Metaobject type handle' },
        limit: { type: 'number', default: 20 },
      },
    },
  },
  {
    name: 'get_metaobject',
    description: 'Get a single metaobject by type and ID',
    inputSchema: {
      type: 'object',
      required: ['type', 'id'],
      properties: {
        type: { type: 'string' },
        id: { type: 'string' },
      },
    },
  },
  {
    name: 'create_metaobject',
    description: 'Create a new metaobject',
    inputSchema: {
      type: 'object',
      required: ['type', 'fields'],
      properties: {
        type: { type: 'string', description: 'Metaobject type handle' },
        fields: {
          type: 'array',
          description: 'Field values for the metaobject',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
    },
  },
  {
    name: 'update_metaobject',
    description: 'Update an existing metaobject',
    inputSchema: {
      type: 'object',
      required: ['type', 'id', 'fields'],
      properties: {
        type: { type: 'string' },
        id: { type: 'string' },
        fields: { type: 'array' },
      },
    },
  },
  {
    name: 'delete_metaobject',
    description: 'Delete a metaobject',
    inputSchema: {
      type: 'object',
      required: ['type', 'id'],
      properties: {
        type: { type: 'string' },
        id: { type: 'string' },
      },
    },
  },

  // ── WEBHOOKS ────────────────────────────────────────────────────────────
  {
    name: 'list_webhooks',
    description: 'List all webhooks',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'create_webhook',
    description: 'Create a new webhook subscription',
    inputSchema: {
      type: 'object',
      required: ['topic', 'address'],
      properties: {
        topic: {
          type: 'string',
          description: 'Webhook topic (e.g. orders/create, products/update, etc.)',
        },
        address: { type: 'string', description: 'Webhook URL endpoint' },
        format: { type: 'string', enum: ['json', 'xml'], default: 'json' },
      },
    },
  },
  {
    name: 'delete_webhook',
    description: 'Delete a webhook',
    inputSchema: {
      type: 'object',
      required: ['webhook_id'],
      properties: { webhook_id: { type: 'string' } },
    },
  },

  // ── STOREFRONT (Headless) ────────────────────────────────────────────────
  {
    name: 'storefront_query',
    description: 'Execute a GraphQL query against the Storefront API',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: 'GraphQL query string' },
        variables: { type: 'object', description: 'Query variables' },
      },
    },
  },

  // ── BULK OPERATIONS ──────────────────────────────────────────────────────
  {
    name: 'list_bulk_operations',
    description: 'List recent bulk operations',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 10 } },
    },
  },
  {
    name: 'get_bulk_operation',
    description: 'Get details of a bulk operation by ID',
    inputSchema: {
      type: 'object',
      required: ['bulk_operation_id'],
      properties: { bulk_operation_id: { type: 'string' } },
    },
  },
  {
    name: 'create_bulk_operation',
    description: 'Create a bulk operation (GraphQL mutation)',
    inputSchema: {
      type: 'object',
      required: ['mutation'],
      properties: {
        mutation: { type: 'string', description: 'GraphQL mutation for bulk operation' },
      },
    },
  },

  // ── REPORTS & ANALYTICS ──────────────────────────────────────────────────
  {
    name: 'get_sales_report',
    description: 'Get sales analytics',
    inputSchema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_90_days'] },
      },
    },
  },
  {
    name: 'get_inventory_report',
    description: 'Get inventory analytics',
    inputSchema: {
      type: 'object',
      properties: {
        location_id: { type: 'string', description: 'Filter by location' },
      },
    },
  },

  // ── THEMES ───────────────────────────────────────────────────────────────
  {
    name: 'list_themes',
    description: 'List all themes (active and inactive)',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'number' } },
    },
  },
  {
    name: 'get_theme',
    description: 'Get a theme by ID',
    inputSchema: {
      type: 'object',
      required: ['theme_id'],
      properties: { theme_id: { type: 'string' } },
    },
  },
  {
    name: 'list_theme_assets',
    description: 'List all assets in a theme (files, CSS, JS, etc.)',
    inputSchema: {
      type: 'object',
      required: ['theme_id'],
      properties: { theme_id: { type: 'string' } },
    },
  },
  {
    name: 'get_theme_asset',
    description: 'Get a single theme asset by key/path',
    inputSchema: {
      type: 'object',
      required: ['theme_id', 'asset_key'],
      properties: {
        theme_id: { type: 'string' },
        asset_key: { type: 'string', description: 'Asset path e.g. "layout/theme.liquid"' },
      },
    },
  },
  {
    name: 'update_theme_asset',
    description: 'Update a theme asset (Liquid, CSS, JS, etc.)',
    inputSchema: {
      type: 'object',
      required: ['theme_id', 'asset_key', 'value'],
      properties: {
        theme_id: { type: 'string' },
        asset_key: { type: 'string' },
        value: { type: 'string', description: 'New content' },
      },
    },
  },
];

// ─── Tool Handlers ──────────────────────────────────────────────────────────
async function handleTool(name, input) {
  try {
    switch (name) {
      case 'get_shop_info':
        return ok(await shopifyREST('/shop.json'));

      case 'list_products':
        return ok(
          await shopifyREST(`/products.json`, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          })
        );

      case 'get_product':
        return ok(await shopifyREST(`/products/${input.product_id}.json`));

      case 'create_product': {
        const body = {
          product: {
            title: input.title,
            body_html: input.body_html || null,
            vendor: input.vendor || null,
            product_type: input.product_type || null,
            status: input.status || 'draft',
            tags: input.tags || '',
            options: input.options || [],
            variants: input.variants || [],
            images: input.images || [],
            metafields: input.metafields || [],
          },
        };
        return ok(await shopifyREST('/products.json', { method: 'POST', body: JSON.stringify(body) }));
      }

      case 'update_product': {
        const body = {
          product: {
            id: input.product_id,
            title: input.title,
            body_html: input.body_html,
            vendor: input.vendor,
            product_type: input.product_type,
            status: input.status,
            tags: input.tags,
          },
        };
        return ok(await shopifyREST(`/products/${input.product_id}.json`, { method: 'PUT', body: JSON.stringify(body) }));
      }

      case 'delete_product':
        return ok(await shopifyREST(`/products/${input.product_id}.json`, { method: 'DELETE' }));

      case 'publish_product': {
        const status = input.published ? 'active' : 'draft';
        const body = { product: { id: input.product_id, status } };
        return ok(await shopifyREST(`/products/${input.product_id}.json`, { method: 'PUT', body: JSON.stringify(body) }));
      }

      case 'list_product_variants':
        return ok(await shopifyREST(`/products/${input.product_id}/variants.json?limit=${input.limit || 50}`));

      case 'create_product_variant': {
        const body = {
          variant: {
            price: input.price,
            compare_at_price: input.compare_at_price || null,
            sku: input.sku || null,
            barcode: input.barcode || null,
            option1: input.option1 || null,
            option2: input.option2 || null,
            option3: input.option3 || null,
            weight: input.weight || null,
            weight_unit: input.weight_unit || 'kg',
            inventory_management: input.inventory_management || 'shopify',
            inventory_quantity: input.inventory_quantity || 0,
            taxable: input.taxable !== false,
            requires_shipping: input.requires_shipping !== false,
          },
        };
        return ok(
          await shopifyREST(`/products/${input.product_id}/variants.json`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'update_product_variant': {
        const body = {
          variant: {
            id: input.variant_id,
            price: input.price,
            compare_at_price: input.compare_at_price,
            sku: input.sku,
            barcode: input.barcode,
            option1: input.option1,
            option2: input.option2,
            option3: input.option3,
            weight: input.weight,
            weight_unit: input.weight_unit,
            inventory_management: input.inventory_management,
            taxable: input.taxable,
            requires_shipping: input.requires_shipping,
          },
        };
        return ok(
          await shopifyREST(`/variants/${input.variant_id}.json`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        );
      }

      case 'delete_product_variant':
        return ok(await shopifyREST(`/products/${input.product_id}/variants/${input.variant_id}.json`, { method: 'DELETE' }));

      case 'get_product_metafields': {
        const query = `
          query {
            product(id: "gid://shopify/Product/${input.product_id}") {
              metafields(first: 50) {
                edges {
                  node {
                    id
                    namespace
                    key
                    value
                    type
                  }
                }
              }
            }
          }
        `;
        const result = await shopifyGQL(query);
        return ok(result);
      }

      case 'set_product_metafield': {
        const mutation = `
          mutation SetMetafield($input: MetafieldsSetInput!) {
            metafieldsSet(input: $input) {
              metafields {
                id
                namespace
                key
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            ownerId: `gid://shopify/Product/${input.product_id}`,
            metafields: [
              {
                namespace: input.namespace,
                key: input.key,
                value: input.value,
                type: input.type,
              },
            ],
          },
        };
        const result = await shopifyGQL(mutation, variables);
        return ok(result);
      }

      case 'add_product_image': {
        const body = {
          image: {
            src: input.src,
            alt: input.alt || null,
            variant_ids: input.variant_ids || [],
          },
        };
        return ok(
          await shopifyREST(`/products/${input.product_id}/images.json`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'list_collections':
        return ok(await shopifyREST('/custom_collections.json?limit=' + (input.limit || 50)));

      case 'get_collection':
        return ok(await shopifyREST(`/custom_collections/${input.collection_id}.json`));

      case 'create_collection': {
        const body = {
          custom_collection: {
            title: input.title,
            body_html: input.body_html || null,
            published: input.published !== false,
            image: input.image_src ? { src: input.image_src } : null,
            sort_order: input.sort_order || 'manual',
          },
        };
        return ok(
          await shopifyREST('/custom_collections.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'update_collection': {
        const body = {
          custom_collection: {
            id: input.collection_id,
            title: input.title,
            body_html: input.body_html,
            published: input.published,
            sort_order: input.sort_order,
          },
        };
        return ok(
          await shopifyREST(`/custom_collections/${input.collection_id}.json`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        );
      }

      case 'add_product_to_collection': {
        const body = { collects: { product_id: input.product_id, collection_id: input.collection_id } };
        return ok(
          await shopifyREST('/collects.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'list_collection_products':
        return ok(await shopifyREST(`/custom_collections/${input.collection_id}/products.json?limit=${input.limit || 50}`));

      case 'list_orders':
        return ok(
          await shopifyREST(
            `/orders.json?limit=${input.limit || 50}${input.status ? '&status=' + input.status : ''}${input.financial_status ? '&financial_status=' + input.financial_status : ''}${input.fulfillment_status ? '&fulfillment_status=' + input.fulfillment_status : ''}`
          )
        );

      case 'get_order':
        return ok(await shopifyREST(`/orders/${input.order_id}.json`));

      case 'create_order': {
        const body = {
          order: {
            line_items: input.line_items || [],
            customer: input.customer || {},
            billing_address: input.shipping_address || {},
            shipping_address: input.shipping_address || {},
            financial_status: input.financial_status || 'authorized',
            send_receipt: input.send_receipt || false,
            note: input.note || null,
            tags: input.tags || '',
          },
        };
        return ok(
          await shopifyREST('/orders.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'update_order': {
        const body = {
          order: {
            id: input.order_id,
            note: input.note,
            tags: input.tags,
            email: input.email,
            shipping_address: input.shipping_address,
          },
        };
        return ok(
          await shopifyREST(`/orders/${input.order_id}.json`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        );
      }

      case 'cancel_order': {
        const body = {
          order: {
            id: input.order_id,
          },
        };
        return ok(
          await shopifyREST(`/orders/${input.order_id}/cancel.json`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'close_order':
        return ok(
          await shopifyREST(`/orders/${input.order_id}/close.json`, {
            method: 'POST',
            body: JSON.stringify({}),
          })
        );

      case 'fulfill_order': {
        const body = {
          fulfillment: {
            line_items: input.line_items || [],
            tracking_info: {
              number: input.tracking_number || null,
              company: input.tracking_company || null,
              url: input.tracking_url || null,
            },
            notify_customer: input.notify_customer !== false,
          },
        };
        return ok(
          await shopifyREST(`/orders/${input.order_id}/fulfillments.json`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'create_refund': {
        const body = {
          refund: {
            note: input.note || null,
            notify: input.notify !== false,
            refund_line_items: input.refund_line_items || [],
            transactions: input.transactions || [],
            shipping: input.shipping || null,
          },
        };
        return ok(
          await shopifyREST(`/orders/${input.order_id}/refunds.json`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'get_order_transactions':
        return ok(await shopifyREST(`/orders/${input.order_id}/transactions.json`));

      case 'list_draft_orders':
        return ok(await shopifyREST(`/draft_orders.json?limit=${input.limit || 50}${input.status ? '&status=' + input.status : ''}`));

      case 'create_draft_order': {
        const body = {
          draft_order: {
            line_items: input.line_items || [],
            customer: input.customer || {},
            shipping_address: input.shipping_address || {},
            note: input.note || null,
            tags: input.tags || '',
            applied_discount: input.discount ? {
              description: input.discount.title,
              value_type: input.discount.value_type,
              value: input.discount.value,
            } : null,
          },
        };
        return ok(
          await shopifyREST('/draft_orders.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'complete_draft_order':
        return ok(
          await shopifyREST(`/draft_orders/${input.draft_order_id}/complete.json`, {
            method: 'PUT',
            body: JSON.stringify({
              draft_order: { id: input.draft_order_id },
              payment_gateway: input.payment_gateway || undefined,
            }),
          })
        );

      case 'list_customers':
        return ok(await shopifyREST(`/customers.json?limit=${input.limit || 50}`));

      case 'search_customers': {
        const query = `
          query SearchCustomers($query: String!) {
            customers(first: ${input.limit || 10}, query: $query) {
              edges {
                node {
                  id
                  email
                  firstName
                  lastName
                  phone
                }
              }
            }
          }
        `;
        const result = await shopifyGQL(query, { query: input.query });
        return ok(result);
      }

      case 'get_customer':
        return ok(await shopifyREST(`/customers/${input.customer_id}.json`));

      case 'create_customer': {
        const body = {
          customer: {
            email: input.email,
            first_name: input.first_name || null,
            last_name: input.last_name || null,
            phone: input.phone || null,
            tags: input.tags || '',
            note: input.note || null,
            accepts_marketing: input.accepts_marketing || false,
            verified_email: input.verified_email || false,
            addresses: input.addresses || [],
            metafields: input.metafields || [],
          },
        };
        return ok(
          await shopifyREST('/customers.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'update_customer': {
        const body = {
          customer: {
            id: input.customer_id,
            email: input.email,
            first_name: input.first_name,
            last_name: input.last_name,
            phone: input.phone,
            tags: input.tags,
            note: input.note,
            accepts_marketing: input.accepts_marketing,
          },
        };
        return ok(
          await shopifyREST(`/customers/${input.customer_id}.json`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        );
      }

      case 'delete_customer':
        return ok(await shopifyREST(`/customers/${input.customer_id}.json`, { method: 'DELETE' }));

      case 'get_customer_orders':
        return ok(await shopifyREST(`/customers/${input.customer_id}/orders.json?limit=${input.limit || 50}`));

      case 'list_locations':
        return ok(await shopifyREST('/locations.json'));

      case 'get_inventory_levels':
        return ok(
          await shopifyREST(
            `/inventory_levels.json?${input.location_ids ? 'location_ids=' + input.location_ids : ''}${input.inventory_item_ids ? 'inventory_item_ids=' + input.inventory_item_ids : ''}&limit=${input.limit || 50}`
          )
        );

      case 'adjust_inventory': {
        const query = `
          mutation AdjustInventory($input: InventoryAdjustQuantitiesInput!) {
            inventoryAdjustQuantities(input: $input) {
              inventoryLevels {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            changes: [
              {
                inventoryItemId: `gid://shopify/InventoryItem/${input.inventory_item_id}`,
                locationId: `gid://shopify/Location/${input.location_id}`,
                deltaQuantity: input.available_adjustment,
              },
            ],
          },
        };
        const result = await shopifyGQL(query, variables);
        return ok(result);
      }

      case 'set_inventory_level': {
        const query = `
          mutation SetInventoryLevel($input: InventorySetQuantitiesInput!) {
            inventorySetQuantities(input: $input) {
              inventoryLevels {
                id
                quantities(names: ["available"]) {
                  name
                  quantity
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            changes: [
              {
                inventoryItemId: `gid://shopify/InventoryItem/${input.inventory_item_id}`,
                locationId: `gid://shopify/Location/${input.location_id}`,
                quantities: [
                  {
                    name: 'available',
                    quantity: input.available,
                  },
                ],
              },
            ],
          },
        };
        const result = await shopifyGQL(query, variables);
        return ok(result);
      }

      case 'list_price_rules':
        return ok(await shopifyREST(`/price_rules.json?limit=${input.limit || 50}`));

      case 'create_price_rule': {
        const body = {
          price_rule: {
            title: input.title,
            value_type: input.value_type,
            value: input.value,
            customer_selection: input.customer_selection,
            target_type: input.target_type,
            target_selection: input.target_selection,
            allocation_method: input.allocation_method,
            starts_at: input.starts_at,
            ends_at: input.ends_at || null,
            usage_limit: input.usage_limit || null,
            once_per_customer: input.once_per_customer || false,
            minimum_quantity: null,
            prerequisite_quantity_range: null,
            minimum_subtotal_requirements: input.minimum_amount ? { greater_than_or_equal_to: input.minimum_amount } : null,
          },
        };
        return ok(
          await shopifyREST('/price_rules.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'create_discount_code': {
        const body = {
          discount_code: {
            price_rule_id: input.price_rule_id,
            code: input.code,
          },
        };
        return ok(
          await shopifyREST(`/price_rules/${input.price_rule_id}/discount_codes.json`, {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'list_discount_codes':
        return ok(await shopifyREST(`/price_rules/${input.price_rule_id}/discount_codes.json`));

      case 'delete_discount_code':
        return ok(
          await shopifyREST(`/price_rules/${input.price_rule_id}/discount_codes/${input.discount_code_id}.json`, {
            method: 'DELETE',
          })
        );

      case 'list_metaobject_definitions': {
        const query = `
          query {
            metaobjectDefinitions(first: ${input.limit || 20}) {
              edges {
                node {
                  id
                  type: name
                  displayName: name
                  description
                  fields {
                    name
                    type
                    required
                    description
                  }
                }
              }
            }
          }
        `;
        const result = await shopifyGQL(query);
        return ok(result);
      }

      case 'create_metaobject_definition': {
        const mutation = `
          mutation CreateMetaobjectDefinition($input: MetaobjectDefinitionInput!) {
            metaobjectDefinitionCreate(input: $input) {
              metaobjectDefinition {
                id
                name
                type
                displayName: name
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            name: input.name,
            type: input.type,
            description: input.description || null,
            fields: input.fields || [],
          },
        };
        const result = await shopifyGQL(mutation, variables);
        return ok(result);
      }

      case 'list_metaobjects': {
        const query = `
          query ListMetaobjects($type: String!) {
            metaobjects(first: ${input.limit || 20}, type: $type) {
              edges {
                node {
                  id
                  type
                  fields {
                    key
                    value
                  }
                }
              }
            }
          }
        `;
        const result = await shopifyGQL(query, { type: input.type });
        return ok(result);
      }

      case 'get_metaobject': {
        const query = `
          query GetMetaobject($id: ID!) {
            metaobject(id: $id) {
              id
              type
              fields {
                key
                value
              }
            }
          }
        `;
        const result = await shopifyGQL(query, { id: `gid://shopify/Metaobject/${input.id}?type=${input.type}` });
        return ok(result);
      }

      case 'create_metaobject': {
        const mutation = `
          mutation CreateMetaobject($input: MetaobjectInput!) {
            metaobjectCreate(input: $input) {
              metaobject {
                id
                type
                fields {
                  key
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            type: input.type,
            fields: input.fields || [],
          },
        };
        const result = await shopifyGQL(mutation, variables);
        return ok(result);
      }

      case 'update_metaobject': {
        const mutation = `
          mutation UpdateMetaobject($input: MetaobjectInput!) {
            metaobjectUpdate(input: $input) {
              metaobject {
                id
                type
                fields {
                  key
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const variables = {
          input: {
            id: `gid://shopify/Metaobject/${input.id}?type=${input.type}`,
            fields: input.fields || [],
          },
        };
        const result = await shopifyGQL(mutation, variables);
        return ok(result);
      }

      case 'delete_metaobject': {
        const mutation = `
          mutation DeleteMetaobject($id: ID!) {
            metaobjectDelete(id: $id) {
              deletedId
              userErrors {
                field
                message
              }
            }
          }
        `;
        const result = await shopifyGQL(mutation, { id: `gid://shopify/Metaobject/${input.id}?type=${input.type}` });
        return ok(result);
      }

      case 'list_webhooks':
        return ok(await shopifyREST(`/webhooks.json?limit=${input.limit || 50}`));

      case 'create_webhook': {
        const body = {
          webhook: {
            topic: input.topic,
            address: input.address,
            format: input.format || 'json',
          },
        };
        return ok(
          await shopifyREST('/webhooks.json', {
            method: 'POST',
            body: JSON.stringify(body),
          })
        );
      }

      case 'delete_webhook':
        return ok(await shopifyREST(`/webhooks/${input.webhook_id}.json`, { method: 'DELETE' }));

      case 'storefront_query': {
        const result = await shopifyGQL(input.query, input.variables || {});
        return ok(result);
      }

      case 'list_bulk_operations': {
        const query = `
          query {
            currentBulkOperation {
              id
              status
              createdAt
              completedAt
              objectCount
              fileSize
              url
              errors(first: 10) {
                edges {
                  node {
                    message
                    details
                  }
                }
              }
            }
          }
        `;
        const result = await shopifyGQL(query);
        return ok(result);
      }

      case 'get_bulk_operation': {
        const query = `
          query GetBulkOperation($id: ID!) {
            node(id: $id) {
              ... on BulkOperation {
                id
                status
                createdAt
                completedAt
                objectCount
                fileSize
                url
                errors(first: 10) {
                  edges {
                    node {
                      message
                      details
                    }
                  }
                }
              }
            }
          }
        `;
        const result = await shopifyGQL(query, { id: input.bulk_operation_id });
        return ok(result);
      }

      case 'create_bulk_operation': {
        const mutation = `
          mutation CreateBulkOperation($input: BulkOperationInput!) {
            bulkOperationRunMutation(mutation: $input) {
              bulkOperation {
                id
                status
                createdAt
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        const result = await shopifyGQL(mutation, { input: input.mutation });
        return ok(result);
      }

      case 'get_sales_report':
        return ok({
          period: input.period || 'today',
          note: 'Sales analytics require a separate Analytics API call or custom reporting setup',
        });

      case 'get_inventory_report':
        return ok(await shopifyREST(`/locations/${input.location_id || 'all'}/inventory_levels.json`));

      case 'list_themes':
        return ok(await shopifyREST(`/themes.json?limit=${input.limit || 50}`));

      case 'get_theme':
        return ok(await shopifyREST(`/themes/${input.theme_id}.json`));

      case 'list_theme_assets':
        return ok(await shopifyREST(`/themes/${input.theme_id}/assets.json`));

      case 'get_theme_asset':
        return ok(await shopifyREST(`/themes/${input.theme_id}/assets.json?asset[key]=${input.asset_key}`));

      case 'update_theme_asset': {
        const body = {
          asset: {
            key: input.asset_key,
            value: input.value,
          },
        };
        return ok(
          await shopifyREST(`/themes/${input.theme_id}/assets.json`, {
            method: 'PUT',
            body: JSON.stringify(body),
          })
        );
      }

      default:
        return err(new Error(`Unknown tool: ${name}`));
    }
  } catch (e) {
    return err(e);
  }
}

// ─── MCP Server Setup ───────────────────────────────────────────────────────
const server = new Server(
  {
    name: 'shopify-mcp',
    version: '2026.01.01',
  },
  {
    tools: TOOLS,
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`[Tool] ${name}`, args);
  return handleTool(name, args);
});

const transport = new StdioServerTransport();
server.connect(transport);
console.error('Shopify MCP Server running — store:', SHOPIFY_STORE_DOMAIN);
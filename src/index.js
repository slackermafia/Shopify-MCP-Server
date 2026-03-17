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
        product_taxonomy_node_id: { type: 'string', description: 'Shopify standard product category GID (e.g. "gid://shopify/TaxonomyCategory/sg-4-17-2-17"). Use list_product_taxonomy to browse categories.' },
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
          description: 'Field definitions',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              name: { type: 'string' },
              type: { type: 'string', description: 'e.g. single_line_text_field, multi_line_text_field, number_integer, boolean, etc.' },
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
    description: 'List metaobjects of a given type',
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
    name: 'create_metaobject',
    description: 'Create a new metaobject entry',
    inputSchema: {
      type: 'object',
      required: ['type', 'fields'],
      properties: {
        type: { type: 'string', description: 'Metaobject type handle' },
        fields: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        handle: { type: 'string', description: 'Optional unique handle/slug' },
        capabilities: {
          type: 'object',
          properties: {
            publishable: {
              type: 'object',
              properties: { status: { type: 'string', enum: ['ACTIVE', 'DRAFT'] } },
            },
          },
        },
      },
    },
  },
  {
    name: 'update_metaobject',
    description: 'Update fields on an existing metaobject',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Metaobject GID (gid://shopify/Metaobject/...)' },
        fields: {
          type: 'array',
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
    name: 'delete_metaobject',
    description: 'Delete a metaobject by GID',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Metaobject GID (gid://shopify/Metaobject/...)' },
      },
    },
  },

  // ── METAFIELDS (generic) ─────────────────────────────────────────────────
  {
    name: 'list_metafields',
    description: 'List metafields for any resource (product, order, customer, shop, etc.)',
    inputSchema: {
      type: 'object',
      required: ['resource', 'resource_id'],
      properties: {
        resource: { type: 'string', description: 'e.g. products, orders, customers, shop' },
        resource_id: { type: 'string', description: 'Resource ID (not needed for shop)' },
        namespace: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'set_metafield',
    description: 'Create or update a metafield on any resource',
    inputSchema: {
      type: 'object',
      required: ['resource', 'resource_id', 'namespace', 'key', 'value', 'type'],
      properties: {
        resource: { type: 'string', description: 'e.g. products, orders, customers, collections' },
        resource_id: { type: 'string' },
        namespace: { type: 'string' },
        key: { type: 'string' },
        value: { type: 'string' },
        type: { type: 'string' },
      },
    },
  },

  // ── REPORTS / ANALYTICS ──────────────────────────────────────────────────
  {
    name: 'get_sales_report',
    description: 'Get a sales summary report (orders count, revenue, AOV) for a date range',
    inputSchema: {
      type: 'object',
      properties: {
        created_at_min: { type: 'string', description: 'ISO 8601 start date' },
        created_at_max: { type: 'string', description: 'ISO 8601 end date' },
        status: { type: 'string', default: 'any' },
      },
    },
  },
  {
    name: 'get_orders_count',
    description: 'Get the count of orders matching given filters',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        financial_status: { type: 'string' },
        fulfillment_status: { type: 'string' },
        created_at_min: { type: 'string' },
        created_at_max: { type: 'string' },
      },
    },
  },
  {
    name: 'get_customers_count',
    description: 'Get the total number of customers in the store',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_products_count',
    description: 'Get the total number of products',
    inputSchema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['active', 'draft', 'archived'] } },
    },
  },

  // ── PAGES & BLOGS ────────────────────────────────────────────────────────
  {
    name: 'list_pages',
    description: 'List all storefront pages',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'] },
      },
    },
  },
  {
    name: 'create_page',
    description: 'Create a new storefront page',
    inputSchema: {
      type: 'object',
      required: ['title'],
      properties: {
        title: { type: 'string' },
        body_html: { type: 'string' },
        published: { type: 'boolean', default: true },
        handle: { type: 'string' },
        metafields: { type: 'array' },
      },
    },
  },
  {
    name: 'update_page',
    description: 'Update a storefront page',
    inputSchema: {
      type: 'object',
      required: ['page_id'],
      properties: {
        page_id: { type: 'string' },
        title: { type: 'string' },
        body_html: { type: 'string' },
        published: { type: 'boolean' },
        handle: { type: 'string' },
      },
    },
  },
  {
    name: 'list_blogs',
    description: 'List all blogs in the store',
    inputSchema: { type: 'object', properties: { limit: { type: 'number' } } },
  },
  {
    name: 'create_article',
    description: 'Create a blog article',
    inputSchema: {
      type: 'object',
      required: ['blog_id', 'title'],
      properties: {
        blog_id: { type: 'string' },
        title: { type: 'string' },
        body_html: { type: 'string' },
        author: { type: 'string' },
        tags: { type: 'string' },
        published: { type: 'boolean', default: true },
        image: {
          type: 'object',
          properties: { src: { type: 'string' }, alt: { type: 'string' } },
        },
      },
    },
  },

  // ── WEBHOOKS ─────────────────────────────────────────────────────────────
  {
    name: 'list_webhooks',
    description: 'List all registered webhooks',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_webhook',
    description: 'Create a new webhook subscription',
    inputSchema: {
      type: 'object',
      required: ['topic', 'address', 'format'],
      properties: {
        topic: { type: 'string', description: 'e.g. orders/create, products/update, customers/create' },
        address: { type: 'string', description: 'HTTPS endpoint URL' },
        format: { type: 'string', enum: ['json', 'xml'], default: 'json' },
      },
    },
  },
  {
    name: 'delete_webhook',
    description: 'Delete a webhook by ID',
    inputSchema: {
      type: 'object',
      required: ['webhook_id'],
      properties: { webhook_id: { type: 'string' } },
    },
  },

  // ── PUBLICATIONS (Sales Channels) ────────────────────────────────────────
  {
    name: 'list_publications',
    description: 'List all sales channels / publications the store has enabled (use the IDs to publish products)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'publish_product_to_channel',
    description: 'Publish a product to a specific sales channel (publication). Use list_publications to get publication IDs.',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'publication_id'],
      properties: {
        product_id: { type: 'string' },
        publication_id: { type: 'string', description: 'Publication ID from list_publications' },
      },
    },
  },
  {
    name: 'unpublish_product_from_channel',
    description: 'Remove a product from a specific sales channel (publication)',
    inputSchema: {
      type: 'object',
      required: ['product_id', 'publication_id'],
      properties: {
        product_id: { type: 'string' },
        publication_id: { type: 'string' },
      },
    },
  },

  // ── INVENTORY ITEMS ───────────────────────────────────────────────────────
  {
    name: 'get_inventory_item',
    description: 'Get an inventory item by ID (includes SKU, HS code, country of origin, tracked status, cost)',
    inputSchema: {
      type: 'object',
      required: ['inventory_item_id'],
      properties: {
        inventory_item_id: { type: 'string' },
      },
    },
  },
  {
    name: 'update_inventory_item',
    description: 'Update an inventory item — set HS tariff code (harmonized_system_code) and/or country of origin (country_code_of_origin) required for international shipping labels and customs',
    inputSchema: {
      type: 'object',
      required: ['inventory_item_id'],
      properties: {
        inventory_item_id: { type: 'string' },
        harmonized_system_code: { type: 'string', description: 'HS tariff code for international shipping/customs (e.g. "9405.10" for lamps/lighting)' },
        country_code_of_origin: { type: 'string', description: 'ISO 3166-1 alpha-2 country code where product is manufactured (e.g. "US", "CN", "DE")' },
        province_code_of_origin: { type: 'string', description: 'Province/state code of manufacture (e.g. "CA" for California)' },
        sku: { type: 'string', description: 'Stock keeping unit' },
        tracked: { type: 'boolean', description: 'Whether inventory is tracked in Shopify' },
        cost: { type: 'string', description: 'Unit cost of the item (for profit reporting)' },
      },
    },
  },
];

// ─── Tool Handlers ──────────────────────────────────────────────────────────
async function handleTool(name, args) {
  switch (name) {
    // ── SHOP ────────────────────────────────────────────────────────────────
    case 'get_shop_info': {
      const data = await shopifyREST('/shop.json');
      return ok(data.shop);
    }

    // ── PRODUCTS ────────────────────────────────────────────────────────────
    case 'list_products': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      if (args.status) params.set('status', args.status);
      if (args.title) params.set('title', args.title);
      if (args.vendor) params.set('vendor', args.vendor);
      if (args.product_type) params.set('product_type', args.product_type);
      if (args.collection_id) params.set('collection_id', args.collection_id);
      if (args.since_id) params.set('since_id', args.since_id);
      const data = await shopifyREST(`/products.json?${params}`);
      return ok(data.products);
    }
    case 'get_product': {
      const data = await shopifyREST(`/products/${args.product_id}.json`);
      return ok(data.product);
    }
    case 'create_product': {
      const body = { product: { ...args } };
      delete body.product.product_id;
      const data = await shopifyREST('/products.json', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return ok(data.product);
    }
    case 'update_product': {
      const { product_id, product_taxonomy_node_id, ...rest } = args;
      if (product_taxonomy_node_id) {
        rest.product_category = { product_taxonomy_node_id };
      }
      const data = await shopifyREST(`/products/${product_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ product: rest }),
      });
      return ok(data.product);
    }
    case 'delete_product': {
      await shopifyREST(`/products/${args.product_id}.json`, { method: 'DELETE' });
      return ok({ success: true, deleted_id: args.product_id });
    }
    case 'publish_product': {
      const status = args.published ? 'active' : 'draft';
      const data = await shopifyREST(`/products/${args.product_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ product: { status } }),
      });
      return ok(data.product);
    }
    case 'list_product_variants': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/products/${args.product_id}/variants.json?${params}`);
      return ok(data.variants);
    }
    case 'create_product_variant': {
      const { product_id, ...variant } = args;
      const data = await shopifyREST(`/products/${product_id}/variants.json`, {
        method: 'POST',
        body: JSON.stringify({ variant }),
      });
      return ok(data.variant);
    }
    case 'update_product_variant': {
      const { variant_id, ...variant } = args;
      const data = await shopifyREST(`/variants/${variant_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ variant }),
      });
      return ok(data.variant);
    }
    case 'delete_product_variant': {
      await shopifyREST(`/products/${args.product_id}/variants/${args.variant_id}.json`, { method: 'DELETE' });
      return ok({ success: true });
    }
    case 'get_product_metafields': {
      const params = new URLSearchParams();
      if (args.namespace) params.set('namespace', args.namespace);
      const data = await shopifyREST(`/products/${args.product_id}/metafields.json?${params}`);
      return ok(data.metafields);
    }
    case 'set_product_metafield': {
      const { product_id, ...metafield } = args;
      const data = await shopifyREST(`/products/${product_id}/metafields.json`, {
        method: 'POST',
        body: JSON.stringify({ metafield }),
      });
      return ok(data.metafield);
    }
    case 'add_product_image': {
      const { product_id, ...image } = args;
      const data = await shopifyREST(`/products/${product_id}/images.json`, {
        method: 'POST',
        body: JSON.stringify({ image }),
      });
      return ok(data.image);
    }

    // ── COLLECTIONS ─────────────────────────────────────────────────────────
    case 'list_collections': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      if (args.title) params.set('title', args.title);
      const [custom, smart] = await Promise.all([
        shopifyREST(`/custom_collections.json?${params}`),
        shopifyREST(`/smart_collections.json?${params}`),
      ]);
      return ok({ custom_collections: custom.custom_collections, smart_collections: smart.smart_collections });
    }
    case 'get_collection': {
      try {
        const data = await shopifyREST(`/custom_collections/${args.collection_id}.json`);
        return ok(data.custom_collection);
      } catch {
        const data = await shopifyREST(`/smart_collections/${args.collection_id}.json`);
        return ok(data.smart_collection);
      }
    }
    case 'create_collection': {
      const { image_src, ...rest } = args;
      const body = { custom_collection: { ...rest } };
      if (image_src) body.custom_collection.image = { src: image_src };
      const data = await shopifyREST('/custom_collections.json', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return ok(data.custom_collection);
    }
    case 'update_collection': {
      const { collection_id, ...rest } = args;
      const data = await shopifyREST(`/custom_collections/${collection_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ custom_collection: rest }),
      });
      return ok(data.custom_collection);
    }
    case 'add_product_to_collection': {
      const data = await shopifyREST('/collects.json', {
        method: 'POST',
        body: JSON.stringify({ collect: { collection_id: args.collection_id, product_id: args.product_id } }),
      });
      return ok(data.collect);
    }
    case 'list_collection_products': {
      const params = new URLSearchParams({ collection_id: args.collection_id });
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/products.json?${params}`);
      return ok(data.products);
    }

    // ── ORDERS ──────────────────────────────────────────────────────────────
    case 'list_orders': {
      const params = new URLSearchParams();
      params.set('status', args.status || 'any');
      if (args.limit) params.set('limit', args.limit);
      if (args.financial_status) params.set('financial_status', args.financial_status);
      if (args.fulfillment_status) params.set('fulfillment_status', args.fulfillment_status);
      if (args.created_at_min) params.set('created_at_min', args.created_at_min);
      if (args.created_at_max) params.set('created_at_max', args.created_at_max);
      if (args.since_id) params.set('since_id', args.since_id);
      if (args.customer_id) params.set('customer_id', args.customer_id);
      const data = await shopifyREST(`/orders.json?${params}`);
      return ok(data.orders);
    }
    case 'get_order': {
      const data = await shopifyREST(`/orders/${args.order_id}.json`);
      return ok(data.order);
    }
    case 'create_order': {
      const data = await shopifyREST('/orders.json', {
        method: 'POST',
        body: JSON.stringify({ order: args }),
      });
      return ok(data.order);
    }
    case 'update_order': {
      const { order_id, ...rest } = args;
      const data = await shopifyREST(`/orders/${order_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ order: rest }),
      });
      return ok(data.order);
    }
    case 'cancel_order': {
      const { order_id, ...rest } = args;
      const data = await shopifyREST(`/orders/${order_id}/cancel.json`, {
        method: 'POST',
        body: JSON.stringify(rest),
      });
      return ok(data.order);
    }
    case 'close_order': {
      const data = await shopifyREST(`/orders/${args.order_id}/close.json`, { method: 'POST', body: '{}' });
      return ok(data.order);
    }
    case 'fulfill_order': {
      const { order_id, ...fulfillment } = args;
      // Use fulfillment orders endpoint (new API)
      const foData = await shopifyREST(`/orders/${order_id}/fulfillment_orders.json`);
      const fulfillmentOrderIds = foData.fulfillment_orders.map(fo => ({ fulfillment_order_id: fo.id }));
      const body = {
        fulfillment: {
          line_items_by_fulfillment_order: fulfillmentOrderIds,
          tracking_info: {
            number: fulfillment.tracking_number,
            company: fulfillment.tracking_company,
            url: fulfillment.tracking_url,
          },
          notify_customer: fulfillment.notify_customer !== false,
        },
      };
      const data = await shopifyREST('/fulfillments.json', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return ok(data.fulfillment);
    }
    case 'create_refund': {
      const { order_id, ...refund } = args;
      const data = await shopifyREST(`/orders/${order_id}/refunds.json`, {
        method: 'POST',
        body: JSON.stringify({ refund }),
      });
      return ok(data.refund);
    }
    case 'get_order_transactions': {
      const data = await shopifyREST(`/orders/${args.order_id}/transactions.json`);
      return ok(data.transactions);
    }

    // ── DRAFT ORDERS ─────────────────────────────────────────────────────────
    case 'list_draft_orders': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      if (args.status) params.set('status', args.status);
      const data = await shopifyREST(`/draft_orders.json?${params}`);
      return ok(data.draft_orders);
    }
    case 'create_draft_order': {
      const data = await shopifyREST('/draft_orders.json', {
        method: 'POST',
        body: JSON.stringify({ draft_order: args }),
      });
      return ok(data.draft_order);
    }
    case 'complete_draft_order': {
      const { draft_order_id, ...rest } = args;
      const params = new URLSearchParams(rest);
      const data = await shopifyREST(`/draft_orders/${draft_order_id}/complete.json?${params}`, { method: 'PUT', body: '{}' });
      return ok(data.draft_order);
    }

    // ── CUSTOMERS ────────────────────────────────────────────────────────────
    case 'list_customers': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      if (args.since_id) params.set('since_id', args.since_id);
      if (args.created_at_min) params.set('created_at_min', args.created_at_min);
      if (args.created_at_max) params.set('created_at_max', args.created_at_max);
      if (args.updated_at_min) params.set('updated_at_min', args.updated_at_min);
      const data = await shopifyREST(`/customers.json?${params}`);
      return ok(data.customers);
    }
    case 'search_customers': {
      const params = new URLSearchParams({ query: args.query });
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/customers/search.json?${params}`);
      return ok(data.customers);
    }
    case 'get_customer': {
      const data = await shopifyREST(`/customers/${args.customer_id}.json`);
      return ok(data.customer);
    }
    case 'create_customer': {
      const data = await shopifyREST('/customers.json', {
        method: 'POST',
        body: JSON.stringify({ customer: args }),
      });
      return ok(data.customer);
    }
    case 'update_customer': {
      const { customer_id, ...rest } = args;
      const data = await shopifyREST(`/customers/${customer_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ customer: rest }),
      });
      return ok(data.customer);
    }
    case 'delete_customer': {
      await shopifyREST(`/customers/${args.customer_id}.json`, { method: 'DELETE' });
      return ok({ success: true, deleted_id: args.customer_id });
    }
    case 'get_customer_orders': {
      const params = new URLSearchParams({ customer_id: args.customer_id });
      params.set('status', args.status || 'any');
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/orders.json?${params}`);
      return ok(data.orders);
    }

    // ── INVENTORY ────────────────────────────────────────────────────────────
    case 'list_locations': {
      const data = await shopifyREST('/locations.json');
      return ok(data.locations);
    }
    case 'get_inventory_levels': {
      const params = new URLSearchParams();
      if (args.location_ids) params.set('location_ids', args.location_ids);
      if (args.inventory_item_ids) params.set('inventory_item_ids', args.inventory_item_ids);
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/inventory_levels.json?${params}`);
      return ok(data.inventory_levels);
    }
    case 'adjust_inventory': {
      const data = await shopifyREST('/inventory_levels/adjust.json', {
        method: 'POST',
        body: JSON.stringify({
          location_id: args.location_id,
          inventory_item_id: args.inventory_item_id,
          available_adjustment: args.available_adjustment,
        }),
      });
      return ok(data.inventory_level);
    }
    case 'set_inventory_level': {
      const data = await shopifyREST('/inventory_levels/set.json', {
        method: 'POST',
        body: JSON.stringify({
          location_id: args.location_id,
          inventory_item_id: args.inventory_item_id,
          available: args.available,
        }),
      });
      return ok(data.inventory_level);
    }

    // ── DISCOUNTS / PRICE RULES ──────────────────────────────────────────────
    case 'list_price_rules': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/price_rules.json?${params}`);
      return ok(data.price_rules);
    }
    case 'create_price_rule': {
      const data = await shopifyREST('/price_rules.json', {
        method: 'POST',
        body: JSON.stringify({ price_rule: args }),
      });
      return ok(data.price_rule);
    }
    case 'create_discount_code': {
      const { price_rule_id, ...discount_code } = args;
      const data = await shopifyREST(`/price_rules/${price_rule_id}/discount_codes.json`, {
        method: 'POST',
        body: JSON.stringify({ discount_code }),
      });
      return ok(data.discount_code);
    }
    case 'list_discount_codes': {
      const data = await shopifyREST(`/price_rules/${args.price_rule_id}/discount_codes.json`);
      return ok(data.discount_codes);
    }
    case 'delete_discount_code': {
      await shopifyREST(`/price_rules/${args.price_rule_id}/discount_codes/${args.discount_code_id}.json`, { method: 'DELETE' });
      return ok({ success: true });
    }

    // ── METAOBJECTS (GraphQL) ────────────────────────────────────────────────
    case 'list_metaobject_definitions': {
      const limit = args.limit || 20;
      const query = `{
        metaobjectDefinitions(first: ${limit}) {
          edges {
            node {
              id
              name
              type
              description
              fieldDefinitions { key name type { name } description required }
            }
          }
        }
      }`;
      const data = await shopifyGQL(query);
      return ok(data.metaobjectDefinitions.edges.map(e => e.node));
    }
    case 'create_metaobject_definition': {
      const mutation = `
        mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition { id name type fieldDefinitions { key name } }
            userErrors { field message }
          }
        }`;
      const variables = {
        definition: {
          name: args.name,
          type: args.type,
          description: args.description,
          fieldDefinitions: args.fields.map(f => ({
            key: f.key,
            name: f.name,
            type: { name: f.type },
            description: f.description,
            required: f.required || false,
          })),
        },
      };
      const data = await shopifyGQL(mutation, variables);
      const result = data.metaobjectDefinitionCreate;
      if (result.userErrors?.length) throw new Error(result.userErrors.map(e => e.message).join(', '));
      return ok(result.metaobjectDefinition);
    }
    case 'list_metaobjects': {
      const limit = args.limit || 20;
      const query = `
        query ListMetaobjects($type: String!, $first: Int!) {
          metaobjects(type: $type, first: $first) {
            edges {
              node {
                id
                handle
                type
                updatedAt
                fields { key value }
              }
            }
          }
        }`;
      const data = await shopifyGQL(query, { type: args.type, first: limit });
      return ok(data.metaobjects.edges.map(e => e.node));
    }
    case 'create_metaobject': {
      const mutation = `
        mutation CreateMetaobject($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject { id handle type fields { key value } }
            userErrors { field message }
          }
        }`;
      const metaobjectInput = {
        type: args.type,
        fields: args.fields,
      };
      if (args.handle) metaobjectInput.handle = args.handle;
      if (args.capabilities) metaobjectInput.capabilities = args.capabilities;
      const data = await shopifyGQL(mutation, { metaobject: metaobjectInput });
      const result = data.metaobjectCreate;
      if (result.userErrors?.length) throw new Error(result.userErrors.map(e => e.message).join(', '));
      return ok(result.metaobject);
    }
    case 'update_metaobject': {
      const mutation = `
        mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id handle type fields { key value } }
            userErrors { field message }
          }
        }`;
      const data = await shopifyGQL(mutation, { id: args.id, metaobject: { fields: args.fields } });
      const result = data.metaobjectUpdate;
      if (result.userErrors?.length) throw new Error(result.userErrors.map(e => e.message).join(', '));
      return ok(result.metaobject);
    }
    case 'delete_metaobject': {
      const mutation = `
        mutation DeleteMetaobject($id: ID!) {
          metaobjectDelete(id: $id) {
            deletedId
            userErrors { field message }
          }
        }`;
      const data = await shopifyGQL(mutation, { id: args.id });
      const result = data.metaobjectDelete;
      if (result.userErrors?.length) throw new Error(result.userErrors.map(e => e.message).join(', '));
      return ok({ success: true, deleted_id: result.deletedId });
    }

    // ── METAFIELDS (generic) ─────────────────────────────────────────────────
    case 'list_metafields': {
      const params = new URLSearchParams();
      if (args.namespace) params.set('namespace', args.namespace);
      if (args.limit) params.set('limit', args.limit);
      let path;
      if (args.resource === 'shop') {
        path = `/metafields.json?${params}`;
      } else {
        path = `/${args.resource}/${args.resource_id}/metafields.json?${params}`;
      }
      const data = await shopifyREST(path);
      return ok(data.metafields);
    }
    case 'set_metafield': {
      const { resource, resource_id, ...metafield } = args;
      const path = `/${resource}/${resource_id}/metafields.json`;
      const data = await shopifyREST(path, {
        method: 'POST',
        body: JSON.stringify({ metafield }),
      });
      return ok(data.metafield);
    }

    // ── REPORTS ──────────────────────────────────────────────────────────────
    case 'get_sales_report': {
      const params = new URLSearchParams({ status: args.status || 'any' });
      if (args.created_at_min) params.set('created_at_min', args.created_at_min);
      if (args.created_at_max) params.set('created_at_max', args.created_at_max);
      params.set('limit', '250');
      const data = await shopifyREST(`/orders.json?${params}`);
      const orders = data.orders;
      const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total_price || 0), 0);
      const totalTax = orders.reduce((sum, o) => sum + parseFloat(o.total_tax || 0), 0);
      const totalShipping = orders.reduce((sum, o) => {
        const shipping = o.shipping_lines?.reduce((s, l) => s + parseFloat(l.price || 0), 0) || 0;
        return sum + shipping;
      }, 0);
      return ok({
        orders_count: orders.length,
        total_revenue: totalRevenue.toFixed(2),
        total_tax: totalTax.toFixed(2),
        total_shipping: totalShipping.toFixed(2),
        average_order_value: orders.length ? (totalRevenue / orders.length).toFixed(2) : '0.00',
        currency: orders[0]?.currency || 'USD',
        date_range: {
          from: args.created_at_min || 'all time',
          to: args.created_at_max || 'now',
        },
      });
    }
    case 'get_orders_count': {
      const params = new URLSearchParams({ status: args.status || 'any' });
      if (args.financial_status) params.set('financial_status', args.financial_status);
      if (args.fulfillment_status) params.set('fulfillment_status', args.fulfillment_status);
      if (args.created_at_min) params.set('created_at_min', args.created_at_min);
      if (args.created_at_max) params.set('created_at_max', args.created_at_max);
      const data = await shopifyREST(`/orders/count.json?${params}`);
      return ok(data);
    }
    case 'get_customers_count': {
      const data = await shopifyREST('/customers/count.json');
      return ok(data);
    }
    case 'get_products_count': {
      const params = new URLSearchParams();
      if (args.status) params.set('status', args.status);
      const data = await shopifyREST(`/products/count.json?${params}`);
      return ok(data);
    }

    // ── PAGES & BLOGS ────────────────────────────────────────────────────────
    case 'list_pages': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      if (args.published_status) params.set('published_status', args.published_status);
      const data = await shopifyREST(`/pages.json?${params}`);
      return ok(data.pages);
    }
    case 'create_page': {
      const data = await shopifyREST('/pages.json', {
        method: 'POST',
        body: JSON.stringify({ page: args }),
      });
      return ok(data.page);
    }
    case 'update_page': {
      const { page_id, ...rest } = args;
      const data = await shopifyREST(`/pages/${page_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ page: rest }),
      });
      return ok(data.page);
    }
    case 'list_blogs': {
      const params = new URLSearchParams();
      if (args.limit) params.set('limit', args.limit);
      const data = await shopifyREST(`/blogs.json?${params}`);
      return ok(data.blogs);
    }
    case 'create_article': {
      const { blog_id, ...article } = args;
      const data = await shopifyREST(`/blogs/${blog_id}/articles.json`, {
        method: 'POST',
        body: JSON.stringify({ article }),
      });
      return ok(data.article);
    }

    // ── WEBHOOKS ─────────────────────────────────────────────────────────────
    case 'list_webhooks': {
      const data = await shopifyREST('/webhooks.json');
      return ok(data.webhooks);
    }
    case 'create_webhook': {
      const data = await shopifyREST('/webhooks.json', {
        method: 'POST',
        body: JSON.stringify({ webhook: args }),
      });
      return ok(data.webhook);
    }
    case 'delete_webhook': {
      await shopifyREST(`/webhooks/${args.webhook_id}.json`, { method: 'DELETE' });
      return ok({ success: true });
    }

    // ── PUBLICATIONS (Sales Channels) ────────────────────────────────────────
    case 'list_publications': {
      const data = await shopifyREST('/publications.json');
      return ok(data.publications);
    }
    case 'publish_product_to_channel': {
      const data = await shopifyREST(`/products/${args.product_id}/publications.json`, {
        method: 'POST',
        body: JSON.stringify({ publication: { publication_id: args.publication_id } }),
      });
      return ok(data.publication);
    }
    case 'unpublish_product_from_channel': {
      await shopifyREST(`/products/${args.product_id}/publications/${args.publication_id}.json`, {
        method: 'DELETE',
      });
      return ok({ success: true, product_id: args.product_id, publication_id: args.publication_id });
    }

    // ── INVENTORY ITEMS ───────────────────────────────────────────────────────
    case 'get_inventory_item': {
      const data = await shopifyREST(`/inventory_items/${args.inventory_item_id}.json`);
      return ok(data.inventory_item);
    }
    case 'update_inventory_item': {
      const { inventory_item_id, ...rest } = args;
      const data = await shopifyREST(`/inventory_items/${inventory_item_id}.json`, {
        method: 'PUT',
        body: JSON.stringify({ inventory_item: rest }),
      });
      return ok(data.inventory_item);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Server Setup ───────────────────────────────────────────────────────
const server = new Server(
  { name: 'shopify-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    return await handleTool(name, args || {});
  } catch (e) {
    return err(e);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Shopify MCP Server running — store:', SHOPIFY_STORE_DOMAIN);

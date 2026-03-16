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
  return { ok: true, data };
}

function error(message) {
  return { ok: false, error: message };
}

// ─── MCP Server ────────────────────────────────────────────────────────────
const server = new Server(
  {
    name: 'shopify-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Tool Definitions ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_shop_info',
      description: 'Get general information about the shop',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'list_products',
      description: 'List all products in the shop',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Limit results (default 50, max 250)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_product',
      description: 'Get a specific product by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The product ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_product',
      description: 'Create a new product',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'Product title',
          },
          body_html: {
            type: 'string',
            description: 'Product description in HTML',
          },
          vendor: {
            type: 'string',
            description: 'Product vendor',
          },
          product_type: {
            type: 'string',
            description: 'Product type',
          },
          published: {
            type: 'boolean',
            description: 'Whether the product is published',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'update_product',
      description: 'Update an existing product',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The product ID',
          },
          title: {
            type: 'string',
            description: 'Product title',
          },
          body_html: {
            type: 'string',
            description: 'Product description in HTML',
          },
          vendor: {
            type: 'string',
            description: 'Product vendor',
          },
          product_type: {
            type: 'string',
            description: 'Product type',
          },
          published: {
            type: 'boolean',
            description: 'Whether the product is published',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_product',
      description: 'Delete a product by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The product ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_orders',
      description: 'List orders from the shop',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            description: 'Filter by status (any, authorized, pending, paid, partially_paid, refunded, voided, partially_refunded, cancelled, expired)',
          },
          limit: {
            type: 'number',
            description: 'Limit results (default 50, max 250)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_order',
      description: 'Get a specific order by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The order ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_customers',
      description: 'List customers from the shop',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Limit results (default 50, max 250)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_customer',
      description: 'Get a specific customer by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The customer ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'create_customer',
      description: 'Create a new customer',
      inputSchema: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            description: 'Customer email',
          },
          first_name: {
            type: 'string',
            description: 'Customer first name',
          },
          last_name: {
            type: 'string',
            description: 'Customer last name',
          },
          phone: {
            type: 'string',
            description: 'Customer phone number',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags',
          },
        },
        required: ['email'],
      },
    },
    {
      name: 'update_customer',
      description: 'Update an existing customer',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The customer ID',
          },
          email: {
            type: 'string',
            description: 'Customer email',
          },
          first_name: {
            type: 'string',
            description: 'Customer first name',
          },
          last_name: {
            type: 'string',
            description: 'Customer last name',
          },
          phone: {
            type: 'string',
            description: 'Customer phone number',
          },
          tags: {
            type: 'string',
            description: 'Comma-separated tags',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'delete_customer',
      description: 'Delete a customer by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The customer ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_collections',
      description: 'List custom collections in the shop',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Limit results (default 50, max 250)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_collection',
      description: 'Get a specific collection by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The collection ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'graphql_query',
      description: 'Execute a GraphQL query against the Admin API',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The GraphQL query string',
          },
          variables: {
            type: 'object',
            description: 'GraphQL variables (as JSON object)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_fulfillments',
      description: 'List fulfillments for a specific order',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'The order ID',
          },
        },
        required: ['order_id'],
      },
    },
    {
      name: 'create_fulfillment',
      description: 'Create a fulfillment for an order',
      inputSchema: {
        type: 'object',
        properties: {
          order_id: {
            type: 'string',
            description: 'The order ID',
          },
          line_items_by_fulfillment_order: {
            type: 'array',
            description: 'Line items grouped by fulfillment order',
            items: {
              type: 'object',
            },
          },
          tracking_info: {
            type: 'object',
            description: 'Tracking information for the fulfillment',
          },
          notify_customer: {
            type: 'boolean',
            description: 'Whether to notify the customer',
          },
        },
        required: ['order_id', 'line_items_by_fulfillment_order'],
      },
    },
    {
      name: 'list_variants',
      description: 'List variants for a specific product',
      inputSchema: {
        type: 'object',
        properties: {
          product_id: {
            type: 'string',
            description: 'The product ID',
          },
          limit: {
            type: 'number',
            description: 'Limit results (default 50, max 250)',
          },
        },
        required: ['product_id'],
      },
    },
    {
      name: 'get_variant',
      description: 'Get a specific variant by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The variant ID',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'update_variant',
      description: 'Update a product variant',
      inputSchema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            description: 'The variant ID',
          },
          title: {
            type: 'string',
            description: 'Variant title',
          },
          sku: {
            type: 'string',
            description: 'Variant SKU',
          },
          price: {
            type: 'string',
            description: 'Variant price',
          },
          compare_at_price: {
            type: 'string',
            description: 'Compared at price',
          },
          weight: {
            type: 'string',
            description: 'Variant weight',
          },
          weight_unit: {
            type: 'string',
            description: 'Weight unit (g, kg, oz, lb)',
          },
          barcode: {
            type: 'string',
            description: 'Variant barcode',
          },
        },
        required: ['id'],
      },
    },
    {
      name: 'list_inventory_levels',
      description: 'List inventory levels for a product variant',
      inputSchema: {
        type: 'object',
        properties: {
          inventory_item_id: {
            type: 'string',
            description: 'The inventory item ID',
          },
        },
        required: ['inventory_item_id'],
      },
    },
    {
      name: 'adjust_inventory',
      description: 'Adjust inventory level for a product variant at a location',
      inputSchema: {
        type: 'object',
        properties: {
          inventory_item_id: {
            type: 'string',
            description: 'The inventory item ID',
          },
          location_id: {
            type: 'string',
            description: 'The location ID',
          },
          available_adjustment: {
            type: 'number',
            description: 'The quantity adjustment (positive or negative)',
          },
        },
        required: ['inventory_item_id', 'location_id', 'available_adjustment'],
      },
    },
    {
      name: 'list_locations',
      description: 'List all locations in the shop',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  ],
}));

// ─── Tool Implementation ────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'get_shop_info': {
        const result = await shopifyREST('/shop.json');
        return ok(result.shop);
      }

      case 'list_products': {
        const limit = args.limit || 50;
        const result = await shopifyREST(`/products.json?limit=${limit}`);
        return ok(result.products);
      }

      case 'get_product': {
        const result = await shopifyREST(`/products/${args.id}.json`);
        return ok(result.product);
      }

      case 'create_product': {
        const body = {
          product: {
            title: args.title,
            body_html: args.body_html,
            vendor: args.vendor,
            product_type: args.product_type,
            published: args.published,
            tags: args.tags,
          },
        };
        const result = await shopifyREST('/products.json', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return ok(result.product);
      }

      case 'update_product': {
        const body = {
          product: {
            id: args.id,
            title: args.title,
            body_html: args.body_html,
            vendor: args.vendor,
            product_type: args.product_type,
            published: args.published,
            tags: args.tags,
          },
        };
        const result = await shopifyREST(`/products/${args.id}.json`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return ok(result.product);
      }

      case 'delete_product': {
        await shopifyREST(`/products/${args.id}.json`, {
          method: 'DELETE',
        });
        return ok({ deleted: true });
      }

      case 'list_orders': {
        const status = args.status || 'any';
        const limit = args.limit || 50;
        const result = await shopifyREST(
          `/orders.json?status=${status}&limit=${limit}`
        );
        return ok(result.orders);
      }

      case 'get_order': {
        const result = await shopifyREST(`/orders/${args.id}.json`);
        return ok(result.order);
      }

      case 'list_customers': {
        const limit = args.limit || 50;
        const result = await shopifyREST(`/customers.json?limit=${limit}`);
        return ok(result.customers);
      }

      case 'get_customer': {
        const result = await shopifyREST(`/customers/${args.id}.json`);
        return ok(result.customer);
      }

      case 'create_customer': {
        const body = {
          customer: {
            email: args.email,
            first_name: args.first_name,
            last_name: args.last_name,
            phone: args.phone,
            tags: args.tags,
          },
        };
        const result = await shopifyREST('/customers.json', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return ok(result.customer);
      }

      case 'update_customer': {
        const body = {
          customer: {
            id: args.id,
            email: args.email,
            first_name: args.first_name,
            last_name: args.last_name,
            phone: args.phone,
            tags: args.tags,
          },
        };
        const result = await shopifyREST(`/customers/${args.id}.json`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return ok(result.customer);
      }

      case 'delete_customer': {
        await shopifyREST(`/customers/${args.id}.json`, {
          method: 'DELETE',
        });
        return ok({ deleted: true });
      }

      case 'list_collections': {
        const limit = args.limit || 50;
        const result = await shopifyREST(
          `/custom_collections.json?limit=${limit}`
        );
        return ok(result.custom_collections);
      }

      case 'get_collection': {
        const result = await shopifyREST(`/custom_collections/${args.id}.json`);
        return ok(result.custom_collection);
      }

      case 'graphql_query': {
        const result = await shopifyGQL(args.query, args.variables);
        return ok(result);
      }

      case 'list_fulfillments': {
        const result = await shopifyREST(
          `/orders/${args.order_id}/fulfillments.json`
        );
        return ok(result.fulfillments);
      }

      case 'create_fulfillment': {
        const body = {
          fulfillment: {
            line_items_by_fulfillment_order: args.line_items_by_fulfillment_order,
            tracking_info: args.tracking_info,
            notify_customer: args.notify_customer !== false,
          },
        };
        const result = await shopifyREST(
          `/orders/${args.order_id}/fulfillments.json`,
          {
            method: 'POST',
            body: JSON.stringify(body),
          }
        );
        return ok(result.fulfillment);
      }

      case 'list_variants': {
        const limit = args.limit || 50;
        const result = await shopifyREST(
          `/products/${args.product_id}/variants.json?limit=${limit}`
        );
        return ok(result.variants);
      }

      case 'get_variant': {
        const result = await shopifyREST(`/variants/${args.id}.json`);
        return ok(result.variant);
      }

      case 'update_variant': {
        const body = {
          variant: {
            id: args.id,
            title: args.title,
            sku: args.sku,
            price: args.price,
            compare_at_price: args.compare_at_price,
            weight: args.weight,
            weight_unit: args.weight_unit,
            barcode: args.barcode,
          },
        };
        const result = await shopifyREST(`/variants/${args.id}.json`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return ok(result.variant);
      }

      case 'list_inventory_levels': {
        const result = await shopifyREST(
          `/inventory_levels.json?inventory_item_ids=${args.inventory_item_id}`
        );
        return ok(result.inventory_levels);
      }

      case 'adjust_inventory': {
        const body = {
          inventory_adjustment: {
            inventory_item_id: args.inventory_item_id,
            location_id: args.location_id,
            available_adjustment: args.available_adjustment,
          },
        };
        const result = await shopifyREST('/inventory_adjustments.json', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return ok(result.inventory_adjustment);
      }

      case 'list_locations': {
        const result = await shopifyREST('/locations.json');
        return ok(result.locations);
      }

      default:
        return error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return error(err.message);
  }
});

// ─── Start Server ──────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Shopify MCP Server is running...');
}

main().catch(console.error);

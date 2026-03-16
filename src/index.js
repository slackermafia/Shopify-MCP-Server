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
  return { content: { type: 'text', text: JSON.stringify(data, null, 2) } };
}

function error(message) {
  return {
    content: { type: 'text', text: `Error: ${message}` },
    isError: true,
  };
}

// ─── All Tools ────────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: 'create_product',
    description: 'Create a new product in the Shopify store',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Product title' },
        vendor: { type: 'string', description: 'Vendor name' },
        productType: { type: 'string', description: 'Product type' },
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
        id: { type: 'string', description: 'Product ID' },
        title: { type: 'string', description: 'New product title' },
      },
      required: ['id'],
    },
  },
  {
    name: 'delete_product',
    description: 'Delete a product',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Product ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_product',
    description: 'Get a specific product',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Product ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_products',
    description: 'List all products',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  {
    name: 'create_order',
    description: 'Create a new order',
    inputSchema: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'Customer ID' },
        lineItems: { type: 'array', description: 'Line items' },
      },
      required: ['customerId'],
    },
  },
  {
    name: 'update_order',
    description: 'Update an existing order',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Order ID' },
        email: { type: 'string', description: 'Customer email' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_order',
    description: 'Get a specific order',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Order ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_orders',
    description: 'List all orders',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
        status: { type: 'string', description: 'Order status' },
      },
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Order ID' },
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
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
      },
      required: ['email'],
    },
  },
  {
    name: 'update_customer',
    description: 'Update a customer',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Customer ID' },
        email: { type: 'string', description: 'Email address' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_customer',
    description: 'Get a specific customer',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Customer ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_customers',
    description: 'List all customers',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  {
    name: 'delete_customer',
    description: 'Delete a customer',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Customer ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_collection',
    description: 'Create a new collection',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Collection title' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_collection',
    description: 'Update a collection',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Collection ID' },
        title: { type: 'string', description: 'New title' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_collection',
    description: 'Get a specific collection',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Collection ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_collections',
    description: 'List all collections',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  {
    name: 'delete_collection',
    description: 'Delete a collection',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Collection ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_discount',
    description: 'Create a discount code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'Discount code' },
        value: { type: 'number', description: 'Discount value' },
      },
      required: ['code', 'value'],
    },
  },
  {
    name: 'update_discount',
    description: 'Update a discount',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Discount ID' },
        value: { type: 'number', description: 'New discount value' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_discount',
    description: 'Get a specific discount',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Discount ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_discounts',
    description: 'List all discounts',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  {
    name: 'delete_discount',
    description: 'Delete a discount',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Discount ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_fulfillment',
    description: 'Create a fulfillment for an order',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
        lineItems: { type: 'array', description: 'Line items to fulfill' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'update_fulfillment',
    description: 'Update a fulfillment',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Fulfillment ID' },
        trackingInfo: { type: 'object', description: 'Tracking info' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_fulfillment',
    description: 'Get a specific fulfillment',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Fulfillment ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_fulfillments',
    description: 'List fulfillments for an order',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'cancel_fulfillment',
    description: 'Cancel a fulfillment',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Fulfillment ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_variant',
    description: 'Create a product variant',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
        title: { type: 'string', description: 'Variant title' },
        price: { type: 'number', description: 'Variant price' },
      },
      required: ['productId', 'title'],
    },
  },
  {
    name: 'update_variant',
    description: 'Update a product variant',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Variant ID' },
        price: { type: 'number', description: 'New price' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_variant',
    description: 'Get a specific variant',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Variant ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_variants',
    description: 'List variants for a product',
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Product ID' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'delete_variant',
    description: 'Delete a product variant',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Variant ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_shop_info',
    description: 'Get shop information',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_webhook',
    description: 'Create a webhook',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Webhook topic' },
        address: { type: 'string', description: 'Webhook URL' },
      },
      required: ['topic', 'address'],
    },
  },
  {
    name: 'update_webhook',
    description: 'Update a webhook',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Webhook ID' },
        address: { type: 'string', description: 'New webhook URL' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_webhook',
    description: 'Get a specific webhook',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Webhook ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_webhooks',
    description: 'List all webhooks',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Filter by topic' },
      },
    },
  },
  {
    name: 'delete_webhook',
    description: 'Delete a webhook',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Webhook ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'create_inventory_level',
    description: 'Create an inventory level',
    inputSchema: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'Variant ID' },
        locationId: { type: 'string', description: 'Location ID' },
        quantity: { type: 'number', description: 'Quantity' },
      },
      required: ['variantId', 'locationId', 'quantity'],
    },
  },
  {
    name: 'update_inventory_level',
    description: 'Update inventory level',
    inputSchema: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'Variant ID' },
        locationId: { type: 'string', description: 'Location ID' },
        quantity: { type: 'number', description: 'New quantity' },
      },
      required: ['variantId', 'locationId', 'quantity'],
    },
  },
  {
    name: 'get_inventory_level',
    description: 'Get inventory level for a variant',
    inputSchema: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'Variant ID' },
        locationId: { type: 'string', description: 'Location ID' },
      },
      required: ['variantId'],
    },
  },
  {
    name: 'list_inventory_levels',
    description: 'List inventory levels',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results' },
      },
    },
  },
  {
    name: 'adjust_inventory',
    description: 'Adjust inventory quantity',
    inputSchema: {
      type: 'object',
      properties: {
        variantId: { type: 'string', description: 'Variant ID' },
        locationId: { type: 'string', description: 'Location ID' },
        availableAdjustment: { type: 'number', description: 'Adjustment' },
      },
      required: ['variantId', 'locationId'],
    },
  },
  {
    name: 'create_location',
    description: 'Create a location',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Location name' },
        address1: { type: 'string', description: 'Address line 1' },
        city: { type: 'string', description: 'City' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_location',
    description: 'Update a location',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Location ID' },
        name: { type: 'string', description: 'New name' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_location',
    description: 'Get a specific location',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Location ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_locations',
    description: 'List all locations',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'create_refund',
    description: 'Create a refund for an order',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
        lineItems: { type: 'array', description: 'Line items to refund' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'get_refund',
    description: 'Get a specific refund',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
        refundId: { type: 'string', description: 'Refund ID' },
      },
      required: ['orderId', 'refundId'],
    },
  },
  {
    name: 'list_refunds',
    description: 'List refunds for an order',
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Order ID' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'create_metafield',
    description: 'Create a metafield',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string', description: 'Namespace' },
        key: { type: 'string', description: 'Key' },
        value: { type: 'string', description: 'Value' },
        resourceId: { type: 'string', description: 'Resource ID' },
        resourceType: { type: 'string', description: 'Resource type' },
      },
      required: ['namespace', 'key', 'value', 'resourceId', 'resourceType'],
    },
  },
  {
    name: 'update_metafield',
    description: 'Update a metafield',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Metafield ID' },
        value: { type: 'string', description: 'New value' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_metafield',
    description: 'Get a specific metafield',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Metafield ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_metafields',
    description: 'List metafields for a resource',
    inputSchema: {
      type: 'object',
      properties: {
        resourceId: { type: 'string', description: 'Resource ID' },
        resourceType: { type: 'string', description: 'Resource type' },
      },
    },
  },
  {
    name: 'delete_metafield',
    description: 'Delete a metafield',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Metafield ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'search_products',
    description: 'Search for products',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_customers',
    description: 'Search for customers',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
      required: ['query'],
    },
  },
];

// ─── Tool Implementations ────────────────────────────────────────────────────
async function handleTool(name, input) {
  try {
    switch (name) {
      case 'get_shop_info':
        return ok(await shopifyREST('/shop.json'));

      case 'create_product':
        return ok(
          await shopifyREST('/products.json', {
            method: 'POST',
            body: JSON.stringify({ product: input }),
          })
        );

      case 'update_product':
        return ok(
          await shopifyREST(`/products/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ product: input }),
          })
        );

      case 'delete_product':
        return ok(
          await shopifyREST(`/products/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_product':
        return ok(
          await shopifyREST(`/products/${input.id}.json`)
        );

      case 'list_products':
        return ok(
          await shopifyREST(`/products.json?limit=${input.limit || 50}`)
        );

      case 'create_customer':
        return ok(
          await shopifyREST('/customers.json', {
            method: 'POST',
            body: JSON.stringify({ customer: input }),
          })
        );

      case 'update_customer':
        return ok(
          await shopifyREST(`/customers/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ customer: input }),
          })
        );

      case 'delete_customer':
        return ok(
          await shopifyREST(`/customers/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_customer':
        return ok(
          await shopifyREST(`/customers/${input.id}.json`)
        );

      case 'list_customers':
        return ok(
          await shopifyREST(`/customers.json?limit=${input.limit || 50}`)
        );

      case 'create_order':
        return ok(
          await shopifyREST('/orders.json', {
            method: 'POST',
            body: JSON.stringify({ order: input }),
          })
        );

      case 'update_order':
        return ok(
          await shopifyREST(`/orders/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ order: input }),
          })
        );

      case 'cancel_order':
        return ok(
          await shopifyREST(`/orders/${input.id}/cancel.json`, {
            method: 'POST',
          })
        );

      case 'get_order':
        return ok(
          await shopifyREST(`/orders/${input.id}.json`)
        );

      case 'list_orders':
        const orderQuery = `/orders.json?limit=${input.limit || 50}${input.status ? `&status=${input.status}` : ''}`;
        return ok(await shopifyREST(orderQuery));

      case 'create_collection':
        return ok(
          await shopifyREST('/collections.json', {
            method: 'POST',
            body: JSON.stringify({ collection: input }),
          })
        );

      case 'update_collection':
        return ok(
          await shopifyREST(`/collections/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ collection: input }),
          })
        );

      case 'delete_collection':
        return ok(
          await shopifyREST(`/collections/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_collection':
        return ok(
          await shopifyREST(`/collections/${input.id}.json`)
        );

      case 'list_collections':
        return ok(
          await shopifyREST(`/collections.json?limit=${input.limit || 50}`)
        );

      case 'create_discount':
        return ok(
          await shopifyREST('/price_rules.json', {
            method: 'POST',
            body: JSON.stringify({ price_rule: input }),
          })
        );

      case 'update_discount':
        return ok(
          await shopifyREST(`/price_rules/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ price_rule: input }),
          })
        );

      case 'delete_discount':
        return ok(
          await shopifyREST(`/price_rules/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_discount':
        return ok(
          await shopifyREST(`/price_rules/${input.id}.json`)
        );

      case 'list_discounts':
        return ok(
          await shopifyREST(`/price_rules.json?limit=${input.limit || 50}`)
        );

      case 'create_fulfillment':
        return ok(
          await shopifyREST(`/orders/${input.orderId}/fulfillments.json`, {
            method: 'POST',
            body: JSON.stringify({ fulfillment: input }),
          })
        );

      case 'update_fulfillment':
        return ok(
          await shopifyREST(`/fulfillments/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ fulfillment: input }),
          })
        );

      case 'cancel_fulfillment':
        return ok(
          await shopifyREST(`/fulfillments/${input.id}/cancel.json`, {
            method: 'POST',
          })
        );

      case 'get_fulfillment':
        return ok(
          await shopifyREST(`/fulfillments/${input.id}.json`)
        );

      case 'list_fulfillments':
        return ok(
          await shopifyREST(`/orders/${input.orderId}/fulfillments.json`)
        );

      case 'create_variant':
        return ok(
          await shopifyREST(`/products/${input.productId}/variants.json`, {
            method: 'POST',
            body: JSON.stringify({ variant: input }),
          })
        );

      case 'update_variant':
        return ok(
          await shopifyREST(`/variants/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ variant: input }),
          })
        );

      case 'delete_variant':
        return ok(
          await shopifyREST(`/variants/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_variant':
        return ok(
          await shopifyREST(`/variants/${input.id}.json`)
        );

      case 'list_variants':
        return ok(
          await shopifyREST(`/products/${input.productId}/variants.json`)
        );

      case 'create_webhook':
        return ok(
          await shopifyREST('/webhooks.json', {
            method: 'POST',
            body: JSON.stringify({ webhook: input }),
          })
        );

      case 'update_webhook':
        return ok(
          await shopifyREST(`/webhooks/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ webhook: input }),
          })
        );

      case 'delete_webhook':
        return ok(
          await shopifyREST(`/webhooks/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_webhook':
        return ok(
          await shopifyREST(`/webhooks/${input.id}.json`)
        );

      case 'list_webhooks':
        const webhookQuery = `/webhooks.json${input.topic ? `?topic=${input.topic}` : ''}`;
        return ok(await shopifyREST(webhookQuery));

      case 'create_inventory_level':
        return ok(
          await shopifyREST('/inventory_levels.json', {
            method: 'POST',
            body: JSON.stringify(input),
          })
        );

      case 'update_inventory_level':
        return ok(
          await shopifyREST('/inventory_levels/adjust.json', {
            method: 'POST',
            body: JSON.stringify({
              inventory_item_id: input.variantId,
              available_adjustment: input.quantity,
            }),
          })
        );

      case 'get_inventory_level':
        return ok(
          await shopifyREST(`/inventory_levels.json?inventory_item_ids=${input.variantId}`)
        );

      case 'list_inventory_levels':
        return ok(
          await shopifyREST(`/inventory_levels.json?limit=${input.limit || 50}`)
        );

      case 'adjust_inventory':
        return ok(
          await shopifyREST('/inventory_levels/adjust.json', {
            method: 'POST',
            body: JSON.stringify({
              inventory_item_id: input.variantId,
              available_adjustment: input.availableAdjustment || 0,
            }),
          })
        );

      case 'create_location':
        return ok(
          await shopifyREST('/locations.json', {
            method: 'POST',
            body: JSON.stringify({ location: input }),
          })
        );

      case 'update_location':
        return ok(
          await shopifyREST(`/locations/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ location: input }),
          })
        );

      case 'get_location':
        return ok(
          await shopifyREST(`/locations/${input.id}.json`)
        );

      case 'list_locations':
        return ok(
          await shopifyREST('/locations.json')
        );

      case 'create_refund':
        return ok(
          await shopifyREST(`/orders/${input.orderId}/refunds.json`, {
            method: 'POST',
            body: JSON.stringify({ refund: input }),
          })
        );

      case 'get_refund':
        return ok(
          await shopifyREST(`/orders/${input.orderId}/refunds/${input.refundId}.json`)
        );

      case 'list_refunds':
        return ok(
          await shopifyREST(`/orders/${input.orderId}/refunds.json`)
        );

      case 'create_metafield':
        return ok(
          await shopifyREST('/metafields.json', {
            method: 'POST',
            body: JSON.stringify({ metafield: input }),
          })
        );

      case 'update_metafield':
        return ok(
          await shopifyREST(`/metafields/${input.id}.json`, {
            method: 'PUT',
            body: JSON.stringify({ metafield: input }),
          })
        );

      case 'delete_metafield':
        return ok(
          await shopifyREST(`/metafields/${input.id}.json`, {
            method: 'DELETE',
          })
        );

      case 'get_metafield':
        return ok(
          await shopifyREST(`/metafields/${input.id}.json`)
        );

      case 'list_metafields':
        return ok(
          await shopifyREST(`/metafields.json`)
        );

      case 'search_products':
        return ok(
          await shopifyREST(
            `/products.json?title=${encodeURIComponent(input.query)}&limit=${input.limit || 50}`
          )
        );

      case 'search_customers':
        return ok(
          await shopifyREST(
            `/customers/search.json?query=${encodeURIComponent(input.query)}&limit=${input.limit || 50}`
          )
        );

      default:
        return error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return error(err.message);
  }
}

// ─── MCP Server Setup ──────────────────────────────────────────────────────
const server = new Server({
  name: 'shopify-mcp',
  version: '1.0.0',
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  return handleTool(name, args);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Shopify MCP Server running (68 tools, API 2026-01)');
}

main().catch(console.error);
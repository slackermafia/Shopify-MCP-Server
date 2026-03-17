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
  const data = await res.json();
  if (data.errors && data.errors.length > 0) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

// ─── Product Operations ─────────────────────────────────────────────────────
async function getProduct(productId) {
  return shopifyREST(`/products/${productId}.json`);
}

async function updateProduct(productId, product) {
  return shopifyREST(`/products/${productId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ product }),
  });
}

async function createProduct(product) {
  return shopifyREST('/products.json', {
    method: 'POST',
    body: JSON.stringify({ product }),
  });
}

async function deleteProduct(productId) {
  return shopifyREST(`/products/${productId}.json`, {
    method: 'DELETE',
  });
}

async function listProducts(options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/products.json?${params}`);
}

// ─── Variant Operations ─────────────────────────────────────────────────────
async function createProductVariant(productId, variant) {
  return shopifyREST(`/products/${productId}/variants.json`, {
    method: 'POST',
    body: JSON.stringify({ variant }),
  });
}

async function updateProductVariant(variantId, variant) {
  return shopifyREST(`/variants/${variantId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ variant }),
  });
}

async function deleteProductVariant(productId, variantId) {
  return shopifyREST(`/products/${productId}/variants/${variantId}.json`, {
    method: 'DELETE',
  });
}

// ─── Collection Operations ──────────────────────────────────────────────────
async function listCollections(options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/collections.json?${params}`);
}

async function getCollection(collectionId) {
  return shopifyREST(`/collections/${collectionId}.json`);
}

async function createCollection(collection) {
  return shopifyREST('/custom_collections.json', {
    method: 'POST',
    body: JSON.stringify({ custom_collection: collection }),
  });
}

async function updateCollection(collectionId, collection) {
  return shopifyREST(`/custom_collections/${collectionId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ custom_collection: collection }),
  });
}

async function addProductToCollection(collectionId, productId) {
  return shopifyREST(`/collects.json`, {
    method: 'POST',
    body: JSON.stringify({
      collect: {
        collection_id: collectionId,
        product_id: productId,
      },
    }),
  });
}

// ─── Customer Operations ────────────────────────────────────────────────────
async function listCustomers(options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/customers.json?${params}`);
}

async function getCustomer(customerId) {
  return shopifyREST(`/customers/${customerId}.json`);
}

async function searchCustomers(query) {
  const params = new URLSearchParams({ query });
  return shopifyREST(`/customers/search.json?${params}`);
}

async function createCustomer(customer) {
  return shopifyREST('/customers.json', {
    method: 'POST',
    body: JSON.stringify({ customer }),
  });
}

async function updateCustomer(customerId, customer) {
  return shopifyREST(`/customers/${customerId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ customer }),
  });
}

async function deleteCustomer(customerId) {
  return shopifyREST(`/customers/${customerId}.json`, {
    method: 'DELETE',
  });
}

// ─── Order Operations ───────────────────────────────────────────────────────
async function listOrders(options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/orders.json?${params}`);
}

async function getOrder(orderId) {
  return shopifyREST(`/orders/${orderId}.json`);
}

async function updateOrder(orderId, order) {
  return shopifyREST(`/orders/${orderId}.json`, {
    method: 'PUT',
    body: JSON.stringify({ order }),
  });
}

async function cancelOrder(orderId, options = {}) {
  return shopifyREST(`/orders/${orderId}/cancel.json`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

async function closeOrder(orderId) {
  return shopifyREST(`/orders/${orderId}/close.json`, {
    method: 'POST',
  });
}

async function createDraftOrder(draftOrder) {
  return shopifyREST('/draft_orders.json', {
    method: 'POST',
    body: JSON.stringify({ draft_order: draftOrder }),
  });
}

async function completeDraftOrder(draftOrderId, paymentGateway = '') {
  return shopifyREST(`/draft_orders/${draftOrderId}/complete.json`, {
    method: 'PUT',
    body: JSON.stringify({
      draft_order: {
        payment_gateway: paymentGateway,
      },
    }),
  });
}

// ─── Fulfillment & Refund Operations ────────────────────────────────────────
async function fulfillOrder(orderId, fulfillment) {
  return shopifyREST(`/orders/${orderId}/fulfillments.json`, {
    method: 'POST',
    body: JSON.stringify({ fulfillment }),
  });
}

async function createRefund(orderId, refund) {
  return shopifyREST(`/orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: JSON.stringify({ refund }),
  });
}

// ─── Price Rule & Discount Operations ───────────────────────────────────────
async function listPriceRules(options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/price_rules.json?${params}`);
}

async function createPriceRule(priceRule) {
  return shopifyREST('/price_rules.json', {
    method: 'POST',
    body: JSON.stringify({ price_rule: priceRule }),
  });
}

async function createDiscountCode(priceRuleId, discountCode) {
  return shopifyREST(`/price_rules/${priceRuleId}/discount_codes.json`, {
    method: 'POST',
    body: JSON.stringify({ discount_code: discountCode }),
  });
}

async function deleteDiscountCode(priceRuleId, discountCodeId) {
  return shopifyREST(
    `/price_rules/${priceRuleId}/discount_codes/${discountCodeId}.json`,
    {
      method: 'DELETE',
    }
  );
}

// ─── Inventory Operations ───────────────────────────────────────────────────
async function getInventoryLevels(options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/inventory_levels.json?${params}`);
}

async function adjustInventory(inventoryItemId, locationId, availableAdjustment) {
  return shopifyREST('/inventory_levels/adjust.json', {
    method: 'POST',
    body: JSON.stringify({
      inventory_item_id: inventoryItemId,
      location_id: locationId,
      available_adjustment: availableAdjustment,
    }),
  });
}

async function getLocations() {
  return shopifyREST('/locations.json');
}

// ─── Metafield Operations ──────────────────────────────────────────────────
async function getProductMetafields(productId, options = {}) {
  const params = new URLSearchParams(options);
  return shopifyREST(`/products/${productId}/metafields.json?${params}`);
}

async function setProductMetafield(productId, metafield) {
  return shopifyREST(`/products/${productId}/metafields.json`, {
    method: 'POST',
    body: JSON.stringify({ metafield }),
  });
}

// ─── Metaobject Operations ─────────────────────────────────────────────────
async function listMetaobjectDefinitions(options = {}) {
  const query = `
    query {
      metaobjectDefinitions(first: 100) {
        edges {
          node {
            id
            name
            type
            displayNameKey
            description
            fields {
              name
              key
              type
            }
          }
        }
      }
    }
  `;
  const result = await shopifyGQL(query);
  return result.metaobjectDefinitions.edges.map((e) => e.node);
}

async function createMetaobjectDefinition(definition) {
  const { name, type, fields, description } = definition;
  const mutation = `
    mutation CreateMetaobjectDefinition($input: MetaobjectDefinitionInput!) {
      metaobjectDefinitionCreate(input: $input) {
        metaobjectDefinition {
          id
          name
          type
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
      name,
      type,
      description,
      fieldDefinitions: fields.map((f) => ({
        name: f.name,
        key: f.key,
        type: f.type,
        required: f.required || false,
        description: f.description || '',
      })),
    },
  };
  const result = await shopifyGQL(mutation, variables);
  return result.metaobjectDefinitionCreate.metaobjectDefinition;
}

async function listMetaobjects(type, options = {}) {
  const first = options.limit || 20;
  const query = `
    query {
      metaobjects(type: "${type}", first: ${first}) {
        edges {
          node {
            id
            handle
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
  const result = await shopifyGQL(query);
  return result.metaobjects.edges.map((e) => e.node);
}

async function createMetaobject(type, fields, handle) {
  const mutation = `
    mutation CreateMetaobject($input: MetaobjectInput!) {
      metaobjectCreate(input: $input) {
        metaobject {
          id
          handle
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
      type,
      fields: fields.map((f) => ({
        key: f.key,
        value: f.value,
      })),
      ...(handle && { handle }),
    },
  };
  const result = await shopifyGQL(mutation, variables);
  return result.metaobjectCreate.metaobject;
}

async function updateMetaobject(id, fields) {
  const mutation = `
    mutation UpdateMetaobject($id: ID!, $input: MetaobjectInput!) {
      metaobjectUpdate(id: $id, input: $input) {
        metaobject {
          id
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
    id,
    input: {
      fields: fields.map((f) => ({
        key: f.key,
        value: f.value,
      })),
    },
  };
  const result = await shopifyGQL(mutation, variables);
  return result.metaobjectUpdate.metaobject;
}

async function deleteMetaobject(id) {
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
  const result = await shopifyGQL(mutation, { id });
  return result.metaobjectDelete;
}

// ─── Product Taxonomy (Category) Operations ────────────────────────────────
async function getProductTaxonomy() {
  const query = `
    query {
      productTaxonomy {
        roots(first: 100) {
          edges {
            node {
              id
              name
              children(first: 100) {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const result = await shopifyGQL(query);
  return result.productTaxonomy.roots.edges.map((e) => e.node);
}

async function listProductTaxonomy() {
  const query = `
    query {
      productTaxonomy {
        roots(first: 100) {
          edges {
            node {
              id
              name
              children(first: 100) {
                edges {
                  node {
                    id
                    name
                    children(first: 100) {
                      edges {
                        node {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  const result = await shopifyGQL(query);
  const roots = [];
  result.productTaxonomy.roots.edges.forEach((root) => {
    roots.push(root.node);
  });
  return roots;
}

// ─── Publication (Sales Channel) Operations ────────────────────────────────
async function listPublications() {
  const query = `
    query {
      publications(first: 100) {
        edges {
          node {
            id
            name
            handle
            isActive
          }
        }
      }
    }
  `;
  const result = await shopifyGQL(query);
  return result.publications.edges.map((e) => e.node);
}

async function publishProductToPublications(productId, publicationIds) {
  // Publish one channel at a time to avoid race conditions
  const results = [];
  for (const publicationId of publicationIds) {
    const mutation = `
      mutation PublishProduct($input: PublishablePublishInput!) {
        publishablePublish(input: $input) {
          publishable {
            id
            onlineStoreUrl
          }
          shop {
            name
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
        id: productId,
        publicationIds: [publicationId],
      },
    };
    const result = await shopifyGQL(mutation, variables);
    results.push(result.publishablePublish);
  }
  return results;
}

async function unpublishProductFromPublication(productId, publicationId) {
  const mutation = `
    mutation UnpublishProduct($input: PublishableUnpublishInput!) {
      publishableUnpublish(input: $input) {
        publishable {
          id
        }
        shop {
          name
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
      id: productId,
      publicationIds: [publicationId],
    },
  };
  const result = await shopifyGQL(mutation, variables);
  return result.publishableUnpublish;
}

// ─── Shop Information ──────────────────────────────────────────────────────
async function getShop() {
  const query = `
    query {
      shop {
        id
        name
        url
        email
        currencyCode
        primaryDomain {
          host
          url
        }
      }
    }
  `;
  const result = await shopifyGQL(query);
  return result.shop;
}

// ─── MCP Server Definition ─────────────────────────────────────────────────
const tools = [
  {
    name: 'get_product',
    description: 'Get a single product by ID',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'list_products',
    description: 'List products with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results (default 50, max 250)',
        },
        status: {
          type: 'string',
          enum: ['active', 'archived', 'draft'],
          description: 'Filter by status',
        },
        product_type: {
          type: 'string',
          description: 'Filter by product type',
        },
        vendor: {
          type: 'string',
          description: 'Filter by vendor',
        },
        title: {
          type: 'string',
          description: 'Filter by title',
        },
        collection_id: {
          type: 'string',
          description: 'Filter by collection ID',
        },
      },
    },
  },
  {
    name: 'create_product',
    description: 'Create a new product with optional variants, images, metafields, and tags',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Product title (required)',
        },
        body_html: {
          type: 'string',
          description: 'Product description (HTML)',
        },
        vendor: {
          type: 'string',
          description: 'Product vendor',
        },
        product_type: {
          type: 'string',
          description: 'Product type',
        },
        status: {
          type: 'string',
          enum: ['active', 'draft', 'archived'],
          description: 'Product status',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
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
              weight: { type: 'number' },
              weight_unit: { type: 'string' },
              inventory_quantity: { type: 'number' },
              requires_shipping: { type: 'boolean' },
              taxable: { type: 'boolean' },
              option1: { type: 'string' },
              option2: { type: 'string' },
              option3: { type: 'string' },
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
              type: { type: 'string' },
              value: { type: 'string' },
            },
          },
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
        product_id: {
          type: 'string',
          description: 'The product ID (required)',
        },
        title: {
          type: 'string',
          description: 'Product title',
        },
        body_html: {
          type: 'string',
          description: 'Product description (HTML)',
        },
        vendor: {
          type: 'string',
          description: 'Product vendor',
        },
        product_type: {
          type: 'string',
          description: 'Product type',
        },
        status: {
          type: 'string',
          enum: ['active', 'draft', 'archived'],
          description: 'Product status',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        product_taxonomy_node_id: {
          type: 'string',
          description: 'Shopify standard product category GID (e.g. "gid://shopify/TaxonomyCategory/sg-4-17-2-17")',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'delete_product',
    description: 'Delete a product by ID',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'publish_product',
    description: 'Publish or unpublish a product (set status to active or draft)',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        published: {
          type: 'boolean',
          description: 'true = active, false = draft',
        },
      },
      required: ['product_id', 'published'],
    },
  },
  {
    name: 'list_product_variants',
    description: 'List all variants for a product',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'create_product_variant',
    description: 'Add a new variant to a product',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        price: {
          type: 'string',
          description: 'Variant price (required)',
        },
        title: {
          type: 'string',
          description: 'Variant title',
        },
        sku: {
          type: 'string',
          description: 'Stock keeping unit',
        },
        barcode: {
          type: 'string',
          description: 'Barcode',
        },
        compare_at_price: {
          type: 'string',
          description: 'Compare at price',
        },
        weight: {
          type: 'number',
          description: 'Weight',
        },
        weight_unit: {
          type: 'string',
          description: 'Weight unit',
        },
        inventory_quantity: {
          type: 'number',
          description: 'Inventory quantity',
        },
        requires_shipping: {
          type: 'boolean',
          description: 'Whether shipping is required',
        },
        taxable: {
          type: 'boolean',
          description: 'Whether item is taxable',
        },
        option1: {
          type: 'string',
          description: 'Option 1 value',
        },
        option2: {
          type: 'string',
          description: 'Option 2 value',
        },
        option3: {
          type: 'string',
          description: 'Option 3 value',
        },
      },
      required: ['product_id', 'price'],
    },
  },
  {
    name: 'update_product_variant',
    description: 'Update an existing product variant',
    inputSchema: {
      type: 'object',
      properties: {
        variant_id: {
          type: 'string',
          description: 'The variant ID (required)',
        },
        price: {
          type: 'string',
          description: 'Variant price',
        },
        title: {
          type: 'string',
          description: 'Variant title',
        },
        sku: {
          type: 'string',
          description: 'Stock keeping unit',
        },
        barcode: {
          type: 'string',
          description: 'Barcode',
        },
        compare_at_price: {
          type: 'string',
          description: 'Compare at price',
        },
        weight: {
          type: 'number',
          description: 'Weight',
        },
        weight_unit: {
          type: 'string',
          description: 'Weight unit',
        },
        requires_shipping: {
          type: 'boolean',
          description: 'Whether shipping is required',
        },
        taxable: {
          type: 'boolean',
          description: 'Whether item is taxable',
        },
        option1: {
          type: 'string',
          description: 'Option 1 value',
        },
        option2: {
          type: 'string',
          description: 'Option 2 value',
        },
        option3: {
          type: 'string',
          description: 'Option 3 value',
        },
      },
      required: ['variant_id'],
    },
  },
  {
    name: 'delete_product_variant',
    description: 'Delete a variant from a product',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        variant_id: {
          type: 'string',
          description: 'The variant ID',
        },
      },
      required: ['product_id', 'variant_id'],
    },
  },
  {
    name: 'get_product_metafields',
    description: 'Get all metafields for a product',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        namespace: {
          type: 'string',
          description: 'Filter by namespace',
        },
      },
      required: ['product_id'],
    },
  },
  {
    name: 'set_product_metafield',
    description: 'Create or update a metafield on a product',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        namespace: {
          type: 'string',
          description: 'Metafield namespace',
        },
        key: {
          type: 'string',
          description: 'Metafield key',
        },
        value: {
          type: 'string',
          description: 'Metafield value',
        },
        type: {
          type: 'string',
          description: 'Metafield type (e.g. single_line_text_field, number_integer, json)',
        },
      },
      required: ['product_id', 'namespace', 'key', 'value', 'type'],
    },
  },
  {
    name: 'add_product_image',
    description: 'Add an image to a product by URL',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        src: {
          type: 'string',
          description: 'Image URL (required)',
        },
        alt: {
          type: 'string',
          description: 'Alt text',
        },
        variant_ids: {
          type: 'array',
          items: { type: 'number' },
          description: 'Associate image with specific variants',
        },
      },
      required: ['product_id', 'src'],
    },
  },
  {
    name: 'list_collections',
    description: 'List all custom and smart collections',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results',
        },
        title: {
          type: 'string',
          description: 'Filter by title',
        },
      },
    },
  },
  {
    name: 'get_collection',
    description: 'Get a collection by ID',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: {
          type: 'string',
          description: 'The collection ID',
        },
      },
      required: ['collection_id'],
    },
  },
  {
    name: 'create_collection',
    description: 'Create a custom collection',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Collection title (required)',
        },
        body_html: {
          type: 'string',
          description: 'Collection description',
        },
        published: {
          type: 'boolean',
          description: 'Publish the collection',
        },
        sort_order: {
          type: 'string',
          enum: ['alpha-asc', 'alpha-desc', 'best-selling', 'created', 'created-desc', 'manual', 'price-asc', 'price-desc'],
          description: 'Sort order',
        },
        image_src: {
          type: 'string',
          description: 'Collection image URL',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_collection',
    description: 'Update a custom collection',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: {
          type: 'string',
          description: 'The collection ID (required)',
        },
        title: {
          type: 'string',
          description: 'Collection title',
        },
        body_html: {
          type: 'string',
          description: 'Collection description',
        },
        published: {
          type: 'boolean',
          description: 'Publish the collection',
        },
        sort_order: {
          type: 'string',
          description: 'Sort order',
        },
      },
      required: ['collection_id'],
    },
  },
  {
    name: 'add_product_to_collection',
    description: 'Add a product to a custom collection',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: {
          type: 'string',
          description: 'The collection ID',
        },
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
      },
      required: ['collection_id', 'product_id'],
    },
  },
  {
    name: 'list_collection_products',
    description: 'List products in a collection',
    inputSchema: {
      type: 'object',
      properties: {
        collection_id: {
          type: 'string',
          description: 'The collection ID',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
      required: ['collection_id'],
    },
  },
  {
    name: 'list_orders',
    description: 'List orders with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'closed', 'cancelled', 'any'],
          description: 'Order status',
        },
        financial_status: {
          type: 'string',
          enum: ['authorized', 'pending', 'paid', 'partially_paid', 'refunded', 'voided', 'any'],
          description: 'Financial status',
        },
        fulfillment_status: {
          type: 'string',
          enum: ['shipped', 'partial', 'unshipped', 'unfulfilled', 'any'],
          description: 'Fulfillment status',
        },
        created_at_min: {
          type: 'string',
          description: 'ISO 8601 date',
        },
        created_at_max: {
          type: 'string',
          description: 'ISO 8601 date',
        },
        customer_id: {
          type: 'string',
          description: 'Filter by customer ID',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 50)',
        },
      },
    },
  },
  {
    name: 'get_order',
    description: 'Get a single order by ID with full details',
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
    name: 'create_order',
    description: 'Create a new order',
    inputSchema: {
      type: 'object',
      properties: {
        line_items: {
          type: 'array',
          description: 'Order line items (required)',
          items: {
            type: 'object',
            properties: {
              product_id: { type: 'number' },
              variant_id: { type: 'number' },
              quantity: { type: 'number' },
              title: { type: 'string' },
              price: { type: 'string' },
            },
          },
        },
        customer: {
          type: 'object',
          description: 'Customer object',
          properties: {
            id: { type: 'number' },
            email: { type: 'string' },
            first_name: { type: 'string' },
            last_name: { type: 'string' },
          },
        },
        note: {
          type: 'string',
          description: 'Order note',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        financial_status: {
          type: 'string',
          description: 'Financial status',
        },
        shipping_address: {
          type: 'object',
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string' },
            address1: { type: 'string' },
            city: { type: 'string' },
            province: { type: 'string' },
            zip: { type: 'string' },
            country: { type: 'string' },
          },
        },
        send_receipt: {
          type: 'boolean',
          description: 'Send receipt to customer',
        },
      },
      required: ['line_items'],
    },
  },
  {
    name: 'update_order',
    description: 'Update an existing order (note, tags, email, shipping address)',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The order ID (required)',
        },
        note: {
          type: 'string',
          description: 'Order note',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        email: {
          type: 'string',
          description: 'Customer email',
        },
        shipping_address: {
          type: 'object',
          description: 'Shipping address',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The order ID (required)',
        },
        reason: {
          type: 'string',
          enum: ['customer', 'fraud', 'inventory', 'declined', 'other'],
          description: 'Cancel reason',
        },
        email: {
          type: 'boolean',
          description: 'Send cancellation email to customer',
        },
        refund: {
          type: 'boolean',
          description: 'Refund payment',
        },
        restock: {
          type: 'boolean',
          description: 'Restock inventory',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'close_order',
    description: 'Close an order (mark as completed)',
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
    name: 'fulfill_order',
    description: 'Create a fulfillment for an order',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The order ID (required)',
        },
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
        location_id: {
          type: 'string',
          description: 'Location ID for fulfillment',
        },
        tracking_company: {
          type: 'string',
          description: 'Tracking company',
        },
        tracking_number: {
          type: 'string',
          description: 'Tracking number',
        },
        tracking_url: {
          type: 'string',
          description: 'Tracking URL',
        },
        notify_customer: {
          type: 'boolean',
          description: 'Notify customer of fulfillment',
        },
      },
      required: ['order_id'],
    },
  },
  {
    name: 'create_refund',
    description: 'Create a refund for an order',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: {
          type: 'string',
          description: 'The order ID (required)',
        },
        note: {
          type: 'string',
          description: 'Refund note',
        },
        notify: {
          type: 'boolean',
          description: 'Notify customer',
        },
        refund_line_items: {
          type: 'array',
          description: 'Line items to refund',
          items: {
            type: 'object',
            properties: {
              line_item_id: { type: 'number' },
              quantity: { type: 'number' },
              location_id: { type: 'number' },
              restock_type: {
                type: 'string',
                enum: ['no_restock', 'cancel', 'return', 'legacy_restock'],
              },
            },
          },
        },
        shipping: {
          type: 'object',
          properties: {
            amount: { type: 'string' },
            full_refund: { type: 'boolean' },
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
      },
      required: ['order_id'],
    },
  },
  {
    name: 'get_order_transactions',
    description: 'Get all transactions for an order',
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
    name: 'list_draft_orders',
    description: 'List draft orders',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'invoice_sent', 'completed', 'any'],
          description: 'Draft order status',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
    },
  },
  {
    name: 'create_draft_order',
    description: 'Create a draft order',
    inputSchema: {
      type: 'object',
      properties: {
        line_items: {
          type: 'array',
          description: 'Order line items (required)',
          items: {
            type: 'object',
            properties: {
              variant_id: { type: 'number' },
              quantity: { type: 'number' },
              title: { type: 'string' },
              price: { type: 'string' },
            },
          },
        },
        customer: {
          type: 'object',
          description: 'Customer object',
        },
        note: {
          type: 'string',
          description: 'Draft order note',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        discount: {
          type: 'object',
          properties: {
            value: { type: 'string' },
            title: { type: 'string' },
            value_type: { type: 'string', enum: ['fixed_amount', 'percentage'] },
          },
        },
        shipping_address: {
          type: 'object',
          description: 'Shipping address',
        },
      },
      required: ['line_items'],
    },
  },
  {
    name: 'complete_draft_order',
    description: 'Complete a draft order (converts to an order)',
    inputSchema: {
      type: 'object',
      properties: {
        draft_order_id: {
          type: 'string',
          description: 'The draft order ID (required)',
        },
        payment_gateway: {
          type: 'string',
          description: 'Payment gateway',
        },
      },
      required: ['draft_order_id'],
    },
  },
  {
    name: 'list_customers',
    description: 'List customers',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results',
        },
        created_at_min: {
          type: 'string',
          description: 'ISO 8601 date',
        },
        created_at_max: {
          type: 'string',
          description: 'ISO 8601 date',
        },
        updated_at_min: {
          type: 'string',
          description: 'ISO 8601 date',
        },
      },
    },
  },
  {
    name: 'search_customers',
    description: 'Search customers by name, email, or phone',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g. "email:foo@bar.com" or "John Smith")',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_customer',
    description: 'Get a customer by ID',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: 'The customer ID',
        },
      },
      required: ['customer_id'],
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
          description: 'Customer email (required)',
        },
        first_name: {
          type: 'string',
          description: 'First name',
        },
        last_name: {
          type: 'string',
          description: 'Last name',
        },
        phone: {
          type: 'string',
          description: 'Phone number',
        },
        note: {
          type: 'string',
          description: 'Customer note',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        accepts_marketing: {
          type: 'boolean',
          description: 'Accepts marketing',
        },
        verified_email: {
          type: 'boolean',
          description: 'Email verified',
        },
        addresses: {
          type: 'array',
          description: 'Customer addresses',
          items: {
            type: 'object',
            properties: {
              address1: { type: 'string' },
              city: { type: 'string' },
              province: { type: 'string' },
              zip: { type: 'string' },
              country: { type: 'string' },
              phone: { type: 'string' },
            },
          },
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
        customer_id: {
          type: 'string',
          description: 'The customer ID (required)',
        },
        email: {
          type: 'string',
          description: 'Customer email',
        },
        first_name: {
          type: 'string',
          description: 'First name',
        },
        last_name: {
          type: 'string',
          description: 'Last name',
        },
        phone: {
          type: 'string',
          description: 'Phone number',
        },
        note: {
          type: 'string',
          description: 'Customer note',
        },
        tags: {
          type: 'string',
          description: 'Comma-separated tags',
        },
        accepts_marketing: {
          type: 'boolean',
          description: 'Accepts marketing',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'delete_customer',
    description: 'Delete a customer by ID',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: 'The customer ID',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'get_customer_orders',
    description: 'Get all orders for a specific customer',
    inputSchema: {
      type: 'object',
      properties: {
        customer_id: {
          type: 'string',
          description: 'The customer ID',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
        status: {
          type: 'string',
          description: 'Order status',
        },
      },
      required: ['customer_id'],
    },
  },
  {
    name: 'list_locations',
    description: 'List all fulfillment locations for the store',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_inventory_levels',
    description: 'Get inventory levels (filter by location or inventory item)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results',
        },
        location_ids: {
          type: 'string',
          description: 'Comma-separated location IDs',
        },
        inventory_item_ids: {
          type: 'string',
          description: 'Comma-separated inventory item IDs',
        },
      },
    },
  },
  {
    name: 'adjust_inventory',
    description: 'Adjust inventory quantity for an item at a location (relative adjustment)',
    inputSchema: {
      type: 'object',
      properties: {
        location_id: {
          type: 'string',
          description: 'Location ID',
        },
        inventory_item_id: {
          type: 'string',
          description: 'Inventory item ID',
        },
        available_adjustment: {
          type: 'number',
          description: 'Positive to add, negative to subtract',
        },
      },
      required: ['location_id', 'inventory_item_id', 'available_adjustment'],
    },
  },
  {
    name: 'set_inventory_level',
    description: 'Set absolute inventory quantity for an item at a location',
    inputSchema: {
      type: 'object',
      properties: {
        location_id: {
          type: 'string',
          description: 'Location ID',
        },
        inventory_item_id: {
          type: 'string',
          description: 'Inventory item ID',
        },
        available: {
          type: 'number',
          description: 'Absolute quantity to set',
        },
      },
      required: ['location_id', 'inventory_item_id', 'available'],
    },
  },
  {
    name: 'list_price_rules',
    description: 'List all price rules (discount types)',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
    },
  },
  {
    name: 'create_price_rule',
    description: 'Create a price rule (basis for discount codes)',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Price rule title',
        },
        value_type: {
          type: 'string',
          enum: ['fixed_amount', 'percentage'],
          description: 'Discount type',
        },
        value: {
          type: 'string',
          description: 'Negative number, e.g. "-10.0" for $10 off or "-25.0" for 25% off',
        },
        customer_selection: {
          type: 'string',
          enum: ['all', 'prerequisite'],
          description: 'Customer selection type',
        },
        target_type: {
          type: 'string',
          enum: ['line_item', 'shipping_line'],
          description: 'Target type',
        },
        target_selection: {
          type: 'string',
          enum: ['all', 'entitled'],
          description: 'Target selection',
        },
        allocation_method: {
          type: 'string',
          enum: ['each', 'across'],
          description: 'How discount is applied',
        },
        starts_at: {
          type: 'string',
          description: 'ISO 8601 datetime',
        },
        ends_at: {
          type: 'string',
          description: 'ISO 8601 datetime (optional)',
        },
        usage_limit: {
          type: 'number',
          description: 'Total uses allowed (optional)',
        },
        once_per_customer: {
          type: 'boolean',
          description: 'Limit to once per customer',
        },
        minimum_amount: {
          type: 'string',
          description: 'Minimum order amount required',
        },
      },
      required: ['title', 'value_type', 'value', 'customer_selection', 'target_type', 'target_selection', 'allocation_method', 'starts_at'],
    },
  },
  {
    name: 'create_discount_code',
    description: 'Create a discount code for an existing price rule',
    inputSchema: {
      type: 'object',
      properties: {
        price_rule_id: {
          type: 'string',
          description: 'Price rule ID',
        },
        code: {
          type: 'string',
          description: 'Discount code string (e.g. SAVE20)',
        },
      },
      required: ['price_rule_id', 'code'],
    },
  },
  {
    name: 'list_discount_codes',
    description: 'List discount codes for a price rule',
    inputSchema: {
      type: 'object',
      properties: {
        price_rule_id: {
          type: 'string',
          description: 'Price rule ID',
        },
      },
      required: ['price_rule_id'],
    },
  },
  {
    name: 'delete_discount_code',
    description: 'Delete a discount code',
    inputSchema: {
      type: 'object',
      properties: {
        price_rule_id: {
          type: 'string',
          description: 'Price rule ID',
        },
        discount_code_id: {
          type: 'string',
          description: 'Discount code ID',
        },
      },
      required: ['price_rule_id', 'discount_code_id'],
    },
  },
  {
    name: 'list_metaobject_definitions',
    description: 'List all metaobject definitions in the store',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
    },
  },
  {
    name: 'create_metaobject_definition',
    description: 'Create a new metaobject definition (custom content type)',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Display name (required)',
        },
        type: {
          type: 'string',
          description: 'Type handle (required)',
        },
        description: {
          type: 'string',
          description: 'Description',
        },
        fields: {
          type: 'array',
          description: 'Field definitions',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              key: { type: 'string' },
              type: { type: 'string' },
              required: { type: 'boolean' },
              description: { type: 'string' },
            },
          },
        },
      },
      required: ['name', 'type', 'fields'],
    },
  },
  {
    name: 'list_metaobjects',
    description: 'List metaobjects of a given type',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Metaobject type handle',
        },
        limit: {
          type: 'number',
          description: 'Max results',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'create_metaobject',
    description: 'Create a new metaobject entry',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Metaobject type handle',
        },
        handle: {
          type: 'string',
          description: 'Optional unique handle/slug',
        },
        fields: {
          type: 'array',
          description: 'Field values',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
        capabilities: {
          type: 'object',
          description: 'Capabilities like publishable status',
          properties: {
            publishable: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['ACTIVE', 'DRAFT'] },
              },
            },
          },
        },
      },
      required: ['type', 'fields'],
    },
  },
  {
    name: 'update_metaobject',
    description: 'Update fields on an existing metaobject',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Metaobject GID (gid://shopify/Metaobject/...)',
        },
        fields: {
          type: 'array',
          description: 'Field values to update',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
      required: ['id', 'fields'],
    },
  },
  {
    name: 'delete_metaobject',
    description: 'Delete a metaobject by GID',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Metaobject GID (gid://shopify/Metaobject/...)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_product_taxonomy',
    description: 'List all product categories in Shopify\'s standard taxonomy',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_publications',
    description: 'List all sales channels / publications the store has enabled',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'publish_product_to_channel',
    description: 'Publish a product to one or more sales channels. Published one channel at a time to avoid race conditions.',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        publication_ids: {
          type: 'string',
          description: 'Comma-separated publication IDs',
        },
      },
      required: ['product_id', 'publication_ids'],
    },
  },
  {
    name: 'unpublish_product_from_channel',
    description: 'Remove a product from a specific sales channel (publication)',
    inputSchema: {
      type: 'object',
      properties: {
        product_id: {
          type: 'string',
          description: 'The product ID',
        },
        publication_id: {
          type: 'string',
          description: 'The publication ID',
        },
      },
      required: ['product_id', 'publication_id'],
    },
  },
  {
    name: 'get_shop_info',
    description: 'Get store information (name, domain, currency, plan, contact email, etc.)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ─── Tool Handlers ────────────────────────────────────────────────────────
async function handleToolCall(toolName, toolInput) {
  try {
    switch (toolName) {
      // Product operations
      case 'get_product': {
        const product = await getProduct(toolInput.product_id);
        return { success: true, data: product };
      }

      case 'list_products': {
        const result = await listProducts(toolInput);
        return { success: true, data: result.products };
      }

      case 'create_product': {
        const result = await createProduct(toolInput);
        return { success: true, data: result.product };
      }

      case 'update_product': {
        const { product_id, ...product } = toolInput;
        const result = await updateProduct(product_id, product);
        return { success: true, data: result.product };
      }

      case 'delete_product': {
        await deleteProduct(toolInput.product_id);
        return { success: true, message: 'Product deleted' };
      }

      case 'publish_product': {
        const product = {
          status: toolInput.published ? 'active' : 'draft',
        };
        const result = await updateProduct(toolInput.product_id, product);
        return { success: true, data: result.product };
      }

      // Variant operations
      case 'list_product_variants': {
        const result = await listProducts({ id: toolInput.product_id });
        const product = result.products[0];
        return {
          success: true,
          data: product ? product.variants : [],
        };
      }

      case 'create_product_variant': {
        const result = await createProductVariant(
          toolInput.product_id,
          toolInput
        );
        return { success: true, data: result.variant };
      }

      case 'update_product_variant': {
        const result = await updateProductVariant(
          toolInput.variant_id,
          toolInput
        );
        return { success: true, data: result.variant };
      }

      case 'delete_product_variant': {
        await deleteProductVariant(
          toolInput.product_id,
          toolInput.variant_id
        );
        return { success: true, message: 'Variant deleted' };
      }

      // Product Image operations
      case 'add_product_image': {
        const imageData = {
          src: toolInput.src,
        };
        if (toolInput.alt) imageData.alt = toolInput.alt;
        const result = await shopifyREST(
          `/products/${toolInput.product_id}/images.json`,
          {
            method: 'POST',
            body: JSON.stringify({ image: imageData }),
          }
        );
        return { success: true, data: result.image };
      }

      // Collection operations
      case 'list_collections': {
        const result = await listCollections(toolInput);
        return { success: true, data: result };
      }

      case 'get_collection': {
        const result = await getCollection(toolInput.collection_id);
        return { success: true, data: result.collection };
      }

      case 'create_collection': {
        const result = await createCollection(toolInput);
        return { success: true, data: result.custom_collection };
      }

      case 'update_collection': {
        const { collection_id, ...collection } = toolInput;
        const result = await updateCollection(collection_id, collection);
        return { success: true, data: result.custom_collection };
      }

      case 'add_product_to_collection': {
        const result = await addProductToCollection(
          toolInput.collection_id,
          toolInput.product_id
        );
        return { success: true, data: result.collect };
      }

      case 'list_collection_products': {
        const products = await listProducts({
          collection_id: toolInput.collection_id,
          limit: toolInput.limit,
        });
        return { success: true, data: products.products };
      }

      // Metafield operations
      case 'get_product_metafields': {
        const result = await getProductMetafields(
          toolInput.product_id,
          { namespace: toolInput.namespace }
        );
        return { success: true, data: result.metafields };
      }

      case 'set_product_metafield': {
        const result = await setProductMetafield(toolInput.product_id, {
          namespace: toolInput.namespace,
          key: toolInput.key,
          type: toolInput.type,
          value: toolInput.value,
        });
        return { success: true, data: result.metafield };
      }

      // Order operations
      case 'list_orders': {
        const result = await listOrders(toolInput);
        return { success: true, data: result.orders };
      }

      case 'get_order': {
        const result = await getOrder(toolInput.order_id);
        return { success: true, data: result.order };
      }

      case 'create_order': {
        const result = await createOrder(toolInput);
        return { success: true, data: result.order };
      }

      case 'update_order': {
        const { order_id, ...order } = toolInput;
        const result = await updateOrder(order_id, order);
        return { success: true, data: result.order };
      }

      case 'cancel_order': {
        const { order_id, reason, email, refund, restock } = toolInput;
        const result = await cancelOrder(order_id, {
          reason,
          email,
          refund,
          restock,
        });
        return { success: true, data: result.order };
      }

      case 'close_order': {
        const result = await closeOrder(toolInput.order_id);
        return { success: true, data: result.order };
      }

      case 'fulfill_order': {
        const { order_id, ...fulfillment } = toolInput;
        const result = await fulfillOrder(order_id, fulfillment);
        return { success: true, data: result.fulfillment };
      }

      case 'create_refund': {
        const { order_id, ...refund } = toolInput;
        const result = await createRefund(order_id, refund);
        return { success: true, data: result.refund };
      }

      case 'get_order_transactions': {
        const result = await shopifyREST(
          `/orders/${toolInput.order_id}/transactions.json`
        );
        return { success: true, data: result.transactions };
      }

      // Draft order operations
      case 'list_draft_orders': {
        const params = new URLSearchParams(toolInput);
        const result = await shopifyREST(`/draft_orders.json?${params}`);
        return { success: true, data: result.draft_orders };
      }

      case 'create_draft_order': {
        const result = await createDraftOrder(toolInput);
        return { success: true, data: result.draft_order };
      }

      case 'complete_draft_order': {
        const result = await completeDraftOrder(
          toolInput.draft_order_id,
          toolInput.payment_gateway
        );
        return { success: true, data: result.draft_order };
      }

      // Customer operations
      case 'list_customers': {
        const result = await listCustomers(toolInput);
        return { success: true, data: result.customers };
      }

      case 'search_customers': {
        const result = await searchCustomers(toolInput.query);
        return { success: true, data: result.customers };
      }

      case 'get_customer': {
        const result = await getCustomer(toolInput.customer_id);
        return { success: true, data: result.customer };
      }

      case 'create_customer': {
        const result = await createCustomer(toolInput);
        return { success: true, data: result.customer };
      }

      case 'update_customer': {
        const { customer_id, ...customer } = toolInput;
        const result = await updateCustomer(customer_id, customer);
        return { success: true, data: result.customer };
      }

      case 'delete_customer': {
        await deleteCustomer(toolInput.customer_id);
        return { success: true, message: 'Customer deleted' };
      }

      case 'get_customer_orders': {
        const result = await getCustomerOrders(
          toolInput.customer_id,
          toolInput.limit
        );
        return { success: true, data: result.orders };
      }

      // Location & Inventory operations
      case 'list_locations': {
        const result = await getLocations();
        return { success: true, data: result.locations };
      }

      case 'get_inventory_levels': {
        const result = await getInventoryLevels(toolInput);
        return { success: true, data: result.inventory_levels };
      }

      case 'adjust_inventory': {
        const result = await adjustInventory(
          toolInput.inventory_item_id,
          toolInput.location_id,
          toolInput.available_adjustment
        );
        return { success: true, data: result.inventory_level };
      }

      case 'set_inventory_level': {
        const result = await shopifyREST(
          '/inventory_levels/set.json',
          {
            method: 'POST',
            body: JSON.stringify({
              inventory_item_id: toolInput.inventory_item_id,
              location_id: toolInput.location_id,
              available: toolInput.available,
            }),
          }
        );
        return { success: true, data: result.inventory_level };
      }

      // Price Rule & Discount operations
      case 'list_price_rules': {
        const result = await listPriceRules(toolInput);
        return { success: true, data: result.price_rules };
      }

      case 'create_price_rule': {
        const result = await createPriceRule(toolInput);
        return { success: true, data: result.price_rule };
      }

      case 'create_discount_code': {
        const result = await createDiscountCode(
          toolInput.price_rule_id,
          { code: toolInput.code }
        );
        return { success: true, data: result.discount_code };
      }

      case 'list_discount_codes': {
        const params = new URLSearchParams(toolInput);
        const result = await shopifyREST(
          `/price_rules/${toolInput.price_rule_id}/discount_codes.json?${params}`
        );
        return { success: true, data: result.discount_codes };
      }

      case 'delete_discount_code': {
        await deleteDiscountCode(
          toolInput.price_rule_id,
          toolInput.discount_code_id
        );
        return { success: true, message: 'Discount code deleted' };
      }

      // Metaobject operations
      case 'list_metaobject_definitions': {
        const definitions = await listMetaobjectDefinitions();
        return { success: true, data: definitions };
      }

      case 'create_metaobject_definition': {
        const definition = await createMetaobjectDefinition(toolInput);
        return { success: true, data: definition };
      }

      case 'list_metaobjects': {
        const metaobjects = await listMetaobjects(
          toolInput.type,
          { limit: toolInput.limit }
        );
        return { success: true, data: metaobjects };
      }

      case 'create_metaobject': {
        const metaobject = await createMetaobject(
          toolInput.type,
          toolInput.fields,
          toolInput.handle
        );
        return { success: true, data: metaobject };
      }

      case 'update_metaobject': {
        const metaobject = await updateMetaobject(
          toolInput.id,
          toolInput.fields
        );
        return { success: true, data: metaobject };
      }

      case 'delete_metaobject': {
        const result = await deleteMetaobject(toolInput.id);
        return { success: true, data: result };
      }

      // Product Taxonomy & Publication operations
      case 'list_product_taxonomy': {
        const taxonomy = await listProductTaxonomy();
        return { success: true, data: taxonomy };
      }

      case 'list_publications': {
        const publications = await listPublications();
        return { success: true, data: publications };
      }

      case 'publish_product_to_channel': {
        const publicationIds = toolInput.publication_ids.split(',');
        const results = await publishProductToPublications(
          toolInput.product_id,
          publicationIds
        );
        return { success: true, data: results };
      }

      case 'unpublish_product_from_channel': {
        const result = await unpublishProductFromPublication(
          toolInput.product_id,
          toolInput.publication_id
        );
        return { success: true, data: result };
      }

      // Shop info
      case 'get_shop_info': {
        const shop = await getShop();
        return { success: true, data: shop };
      }

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
    };
  }
}

// ─── MCP Server Setup ─────────────────────────────────────────────────────
const server = new Server(
  {
    name: 'shopify-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: toolArgs } = request.params;
  const result = await handleToolCall(name, toolArgs);
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log('Shopify MCP Server running — store:', SHOPIFY_STORE_DOMAIN);
}

main().catch(console.error);

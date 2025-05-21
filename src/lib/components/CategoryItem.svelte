<!-- CategoryItem.svelte -->
<script lang="ts">
    import { slide } from 'svelte/transition';
    
    export let category: string;
    export let selectedCategory: string;
    export let onSelectCategory: (category: string) => void;
    export let hasChildrenFn: (category: string) => boolean;
    export let getChildrenFn: (category: string) => string[];
    
    // Track expanded state
    let expanded = false;
    
    function toggleExpand() {
      if (hasChildrenFn(category)) {
        expanded = !expanded;
      }
    }
    
    // Get just the category name, not the full path
    $: categoryName = category.includes('/') 
      ? category.split('/').pop() 
      : category;
      
    $: hasChildren = hasChildrenFn(category);
    $: childCategories = hasChildren ? getChildrenFn(category) : [];
  </script>
  
  <div>
    <div 
      class={`
        flex items-center px-3 py-2 rounded-md text-sm font-medium
        ${selectedCategory === category 
          ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white' 
          : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}
      `}
    >
      {#if hasChildren}
        <!-- svelte-ignore a11y_consider_explicit_label -->
        <button 
          on:click|stopPropagation={toggleExpand} 
          class="mr-1.5 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            class={`h-4 w-4 transition-transform ${expanded ? 'transform rotate-90' : ''}`} 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path 
              fill-rule="evenodd" 
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" 
              clip-rule="evenodd" 
            />
          </svg>
        </button>
      {/if}
      
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div 
        class="flex-1 flex items-center cursor-pointer"
        on:click={() => onSelectCategory(category)}
      >
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          class="h-4 w-4 mr-2 text-gray-400" 
          viewBox="0 0 20 20" 
          fill="currentColor"
        >
          <path 
            fill-rule="evenodd" 
            d="M2 6a2 2 0 012-2h4l2 2h4a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" 
            clip-rule="evenodd" 
          />
        </svg>
        <span>{categoryName}</span>
      </div>
    </div>
    
    {#if expanded && hasChildren}
      <div 
        class="ml-4 pl-2 border-l border-gray-200 dark:border-gray-700 mt-1 space-y-1"
        transition:slide={{ duration: 150 }}
      >
        {#each childCategories as childCategory}
          <svelte:self 
            category={childCategory}
            {selectedCategory}
            {onSelectCategory}
            hasChildrenFn={hasChildrenFn}
            getChildrenFn={getChildrenFn}
          />
        {/each}
      </div>
    {/if}
  </div>
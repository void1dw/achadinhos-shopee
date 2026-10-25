<script lang="ts">
	import { X } from '@lucide/svelte';
	import { toast } from '../toast.svelte';
</script>

{#if toast.message}
	<div class="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" role="status">
		<div
			class="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-3 text-sm font-medium text-white shadow-lg"
		>
			<X size={16} />
			{toast.message}
		</div>
	</div>
{/if}
